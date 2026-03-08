import { prisma } from "../db";
import { DAILY_OUT_LIMIT, startOfUtcDay } from "../config/limits";

type TransferInput = {
  userId: string;
  toWalletId: string;
  amount: number;
  fee: number;
};

type CashInput = {
  userId: string;
  amount: number;
};

export class TransactionsService {
  static async getSpentToday(fromWalletId: string): Promise<bigint> {
    const since = startOfUtcDay();

    const txs = await prisma.transaction.findMany({
      where: {
        fromWalletId,
        status: "SUCCESS",
        createdAt: { gte: since },
        type: { in: ["WITHDRAW", "TRANSFER"] },
      },
      select: { amount: true, fee: true },
    });

    let total = 0n;
    for (const t of txs) {
      total += (t.amount ?? 0n) + (t.fee ?? 0n);
    }

    return total;
  }

  private static async getSystemWallet(currency: string) {
    const systemUser = await prisma.user.findFirst({ where: { role: "SYSTEM" } });
    if (!systemUser) return null;

    return prisma.wallet.findFirst({
      where: { userId: systemUser.id, currency },
    });
  }

  static async transfer(input: TransferInput): Promise<{ status: number; body: any }> {
    const { userId, toWalletId, amount } = input;
    // calcul du fee côté serveur
const fee = Math.max(10, Math.floor(amount * 0.01));

    // 1) Wallet source
    const fromWallet = await prisma.wallet.findFirst({ where: { userId } });
    if (!fromWallet) {
      return { status: 404, body: { ok: false, message: "Wallet source introuvable" } };
    }

    if (!toWalletId || typeof toWalletId !== "string") {
      return { status: 400, body: { ok: false, message: "toWalletId manquant" } };
    }

    if (fromWallet.id === toWalletId) {
      return { status: 400, body: { ok: false, message: "Transfert vers le même wallet interdit" } };
    }

    // 2) Wallet destination
    const toWallet = await prisma.wallet.findUnique({ where: { id: toWalletId } });
    if (!toWallet) {
      return { status: 404, body: { ok: false, message: "Wallet destination introuvable" } };
    }

    if (toWallet.currency !== fromWallet.currency) {
      return { status: 400, body: { ok: false, message: "Currency mismatch" } };
    }

    // 3) System wallet (frais)
    const systemWallet = await TransactionsService.getSystemWallet(fromWallet.currency);
    if (!systemWallet) {
      return { status: 500, body: { ok: false, message: "SYSTEM wallet manquant" } };
    }

    // 4) Convertir en BigInt
    const amountBI = BigInt(amount);
    const feeBI = BigInt(fee);
    const totalDebit = amountBI + feeBI;

    // 4bis) Limite journalière (WITHDRAW + TRANSFER) = amount + fee
    const spentToday = await this.getSpentToday(fromWallet.id);
    const nextSpent = spentToday + totalDebit;

    console.log("[LIMIT-CHECK]", {
      limit: DAILY_OUT_LIMIT.toString(),
      spentToday: spentToday.toString(),
      attempted: totalDebit.toString(),
      nextSpent: nextSpent.toString(),
      now: new Date().toISOString(),
    });

    if (nextSpent > DAILY_OUT_LIMIT) {
      return {
        status: 429,
        body: {
          ok: false,
          message: "Limite journalière dépassée",
          limit: DAILY_OUT_LIMIT.toString(),
          spentToday: spentToday.toString(),
          attempted: totalDebit.toString(),
        },
      };
    }

    // 5) Transaction atomique (anti race condition)
    const result = await prisma.$transaction(async (tx) => {
      const debit = await tx.wallet.updateMany({
        where: { id: fromWallet.id, balance: { gte: totalDebit } },
        data: { balance: { decrement: totalDebit } },
      });

      if (debit.count !== 1) {
        return { ok: false as const, code: 409, message: "Solde insuffisant" };
      }

      await tx.wallet.update({
        where: { id: toWallet.id },
        data: { balance: { increment: amountBI } },
      });

      if (feeBI > 0n) {
        await tx.wallet.update({
          where: { id: systemWallet.id },
          data: { balance: { increment: feeBI } },
        });
      }

      const created = await tx.transaction.create({
        data: {
          type: "TRANSFER",
          fromWalletId: fromWallet.id,
          toWalletId: toWallet.id,
          amount: amountBI,
          fee: feeBI,
          status: "SUCCESS",
        },
      });

      return { ok: true as const, transaction: created };
    });

    if (!result.ok) {
      return {
        status: (result as any).code ?? 400,
        body: { ok: false, message: (result as any).message },
      };
    }

    const t = result.transaction;
    return {
      status: 201,
      body: {
        ok: true,
        transaction: {
          id: t.id,
          type: t.type,
          fromWalletId: t.fromWalletId,
          toWalletId: t.toWalletId,
          amount: t.amount.toString(),
          fee: t.fee.toString(),
          status: t.status,
          createdAt: t.createdAt,
        },
      },
    };
  }

  static async deposit(input: CashInput): Promise<{ status: number; body: any }> {
    const { userId, amount } = input;

    const wallet = await prisma.wallet.findFirst({ where: { userId } });
    if (!wallet) {
      return { status: 404, body: { ok: false, message: "Wallet introuvable" } };
    }

    const systemWallet = await TransactionsService.getSystemWallet(wallet.currency);
    if (!systemWallet) {
      return { status: 500, body: { ok: false, message: "SYSTEM wallet manquant" } };
    }

    const amountBI = BigInt(amount);

    const result = await prisma.$transaction(async (tx) => {
      // Credit user wallet
      const updated = await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: { increment: amountBI } },
      });

      // Debit system wallet (contrepartie)
      await tx.wallet.update({
        where: { id: systemWallet.id },
        data: { balance: { decrement: amountBI } },
      });

      const created = await tx.transaction.create({
        data: {
          type: "DEPOSIT",
          fromWalletId: systemWallet.id,
          toWalletId: updated.id,
          amount: amountBI,
          fee: 0n,
          status: "SUCCESS",
        },
      });

      return { ok: true as const, wallet: updated, transaction: created };
    });

    return {
      status: 201,
      body: {
        ok: true,
        wallet: { ...result.wallet, balance: result.wallet.balance.toString() },
        transaction: {
          id: result.transaction.id,
          type: result.transaction.type,
          fromWalletId: result.transaction.fromWalletId,
          toWalletId: result.transaction.toWalletId,
          amount: result.transaction.amount.toString(),
          fee: result.transaction.fee.toString(),
          status: result.transaction.status,
          createdAt: result.transaction.createdAt,
        },
      },
    };
  }

  static async withdraw(input: CashInput): Promise<{ status: number; body: any }> {
    const { userId, amount } = input;

    const wallet = await prisma.wallet.findFirst({ where: { userId } });
    if (!wallet) {
      return { status: 404, body: { ok: false, message: "Wallet introuvable" } };
    }

    const systemWallet = await TransactionsService.getSystemWallet(wallet.currency);
    if (!systemWallet) {
      return { status: 500, body: { ok: false, message: "SYSTEM wallet manquant" } };
    }

    const amountBI = BigInt(amount);

    const result = await prisma.$transaction(async (tx) => {
      const debit = await tx.wallet.updateMany({
        where: { id: wallet.id, balance: { gte: amountBI } },
        data: { balance: { decrement: amountBI } },
      });

      if (debit.count !== 1) {
        return { ok: false as const, code: 409, message: "Solde insuffisant" };
      }

      // Credit system wallet (contrepartie)
      await tx.wallet.update({
        where: { id: systemWallet.id },
        data: { balance: { increment: amountBI } },
      });

      const updated = await tx.wallet.findUnique({ where: { id: wallet.id } });
      if (!updated) {
        return { ok: false as const, code: 500, message: "Wallet introuvable après débit" };
      }

      const created = await tx.transaction.create({
        data: {
          type: "WITHDRAW",
          fromWalletId: wallet.id,
          toWalletId: systemWallet.id,
          amount: amountBI,
          fee: 0n,
          status: "SUCCESS",
        },
      });

      return { ok: true as const, wallet: updated, transaction: created };
    });

    if (!result.ok) {
      return {
        status: (result as any).code ?? 400,
        body: { ok: false, message: (result as any).message },
      };
    }

    const r = result as any;
    return {
      status: 201,
      body: {
        ok: true,
        wallet: { ...r.wallet, balance: r.wallet.balance.toString() },
        transaction: {
          id: r.transaction.id,
          type: r.transaction.type,
          fromWalletId: r.transaction.fromWalletId,
          toWalletId: r.transaction.toWalletId,
          amount: r.transaction.amount.toString(),
          fee: r.transaction.fee.toString(),
          status: r.transaction.status,
          createdAt: r.transaction.createdAt,
        },
      },
    };
  }
}