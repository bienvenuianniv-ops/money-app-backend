// src/services/transactions.service.ts

import crypto from "crypto";
import { prisma } from "../db";
import { AuditService } from "./audit.service";
import { ExchangeService } from "./exchange.service";

// ─────────────────────────────────────────────
// ERREUR MÉTIER
// ─────────────────────────────────────────────

export class TransactionError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "TransactionError";
    this.statusCode = statusCode;
  }
}

// ─────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────

type TransferInput = {
  senderUserId: string;
  recipientPhone: string;
  amount: number;
  currency?: string;
  note?: string;
  idempotencyKey: string;
  ip?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
  correlationId?: string | null;
};

type DepositInput = {
  userId: string;
  amount: number;
  currency: string;
  note?: string;
  requestId?: string | null;
};

type WithdrawInput = {
  userId: string;
  amount: number;
  currency: string;
  idempotencyKey: string;
  note?: string;
  ip?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
  correlationId?: string | null;
};

type PaginationInput = {
  page?: number;
  limit?: number;
  currency?: string;
  type?: "TRANSFER" | "DEPOSIT" | "WITHDRAW";
};

// ─────────────────────────────────────────────
// SERVICE
// ─────────────────────────────────────────────

export class TransactionsService {

  // ── TRANSFERT P2P (multi-devises) ─────────────

  static async transfer(input: TransferInput) {
    const {
      senderUserId,
      recipientPhone,
      amount,
      currency,
      note,
      idempotencyKey,
      ip = null,
      userAgent = null,
      requestId = null,
      correlationId = null,
    } = input;

    if (!recipientPhone || typeof recipientPhone !== "string") {
      throw new TransactionError("Le numéro du destinataire est requis.", 400);
    }
    if (!Number.isInteger(amount) || amount <= 0) {
      throw new TransactionError("Le montant doit être un entier positif.", 400);
    }
    if (!idempotencyKey || typeof idempotencyKey !== "string") {
      throw new TransactionError("Le header x-idempotency-key est requis.", 400);
    }

    const endpoint = "POST:/api/transactions/transfer";
    const requestHash = this.buildRequestHash({ senderUserId, recipientPhone, amount, endpoint });

    const existingKey = await prisma.idempotencyKey.findFirst({
      where: { userId: senderUserId, endpoint, key: idempotencyKey },
    });
    if (existingKey) {
      if (existingKey.requestHash !== requestHash) {
        throw new TransactionError(
          "Cette clé d'idempotence a déjà été utilisée avec une autre requête.", 409
        );
      }
      return existingKey.responseBody
        ? JSON.parse(existingKey.responseBody)
        : { message: "Requête déjà traitée." };
    }

    const sender = await prisma.user.findUnique({
      where: { id: senderUserId },
      include: { wallets: true },
    });
    if (!sender) throw new TransactionError("Expéditeur introuvable.", 404);
    if (sender.status !== "ACTIVE") throw new TransactionError("Compte expéditeur inactif.", 403);

    const recipient = await prisma.user.findUnique({
      where: { phone: recipientPhone },
      include: { wallets: true },
    });
    if (!recipient) throw new TransactionError("Destinataire introuvable.", 404);
    if (recipient.status !== "ACTIVE") throw new TransactionError("Compte destinataire inactif.", 403);
    if (recipient.id === sender.id) throw new TransactionError("Transfert vers soi-même interdit.", 400);

    const senderCurrency = currency || sender.wallets[0]?.currency || "XOF";
    const recipientCurrency = recipient.wallets[0]?.currency || "XOF";

    const senderWallet = sender.wallets.find((w) => w.currency === senderCurrency && w.isActive);
    if (!senderWallet) {
      throw new TransactionError(
        `Wallet ${senderCurrency} introuvable ou inactif pour l'expéditeur.`, 404
      );
    }

    let recipientWallet = recipient.wallets.find((w) => w.currency === recipientCurrency && w.isActive);
    if (!recipientWallet) {
      recipientWallet = await prisma.wallet.create({
        data: { userId: recipient.id, currency: recipientCurrency, balance: 0n, isActive: true },
      });
    }

    const amountBigInt = BigInt(amount);
    const fee = ExchangeService.calculateFee(amountBigInt, senderCurrency, recipientCurrency);
    const totalDebit = amountBigInt + fee;

    if (senderWallet.balance < totalDebit) {
      throw new TransactionError(
        `Solde insuffisant. Disponible : ${senderWallet.balance} ${senderCurrency}, nécessaire : ${totalDebit} ${senderCurrency} (dont ${fee} de frais).`,
        400
      );
    }

    const { convertedAmount, rate } = await ExchangeService.convert(
      amountBigInt,
      senderCurrency,
      recipientCurrency
    );

    const reference = this.generateReference();

    // Charger le wallet SYSTEM avant la transaction atomique
    const systemWallet = await prisma.wallet.findFirst({
      where: { user: { role: "SYSTEM" }, currency: senderCurrency },
    });

    const result = await prisma.$transaction(async (tx) => {
      const freshSenderWallet = await tx.wallet.findUnique({ where: { id: senderWallet.id } });
      const freshRecipientWallet = await tx.wallet.findUnique({ where: { id: recipientWallet!.id } });

      if (!freshSenderWallet || !freshRecipientWallet) {
        throw new TransactionError("Wallet introuvable pendant la transaction.", 404);
      }
      if (freshSenderWallet.balance < totalDebit) {
        throw new TransactionError("Solde insuffisant.", 400);
      }

      // Débit expéditeur (montant + frais)
      const updatedSenderWallet = await tx.wallet.update({
        where: { id: freshSenderWallet.id },
        data: { balance: freshSenderWallet.balance - totalDebit },
      });

      // Crédit destinataire (montant converti)
      const updatedRecipientWallet = await tx.wallet.update({
        where: { id: freshRecipientWallet.id },
        data: { balance: freshRecipientWallet.balance + convertedAmount },
      });

      // ── NOUVEAU : Crédit wallet SYSTEM avec les frais ──
      if (fee > 0n && systemWallet) {
        await tx.wallet.update({
          where: { id: systemWallet.id },
          data: { balance: { increment: fee } },
        });
      }

      const transaction = await tx.transaction.create({
        data: {
          type: "TRANSFER",
          fromWalletId: freshSenderWallet.id,
          toWalletId: freshRecipientWallet.id,
          amount: amountBigInt,
          fee,
          fromCurrency: senderCurrency,
          toCurrency: recipientCurrency,
          exchangeRate: rate,
          convertedAmount,
          status: "SUCCESS",
          reference,
          note: note || null,
        },
      });

      const responsePayload = {
        message: "Transfert effectué avec succès.",
        transaction: {
          id: transaction.id,
          reference: transaction.reference,
          type: transaction.type,
          status: transaction.status,
          amount: transaction.amount.toString(),
          fee: transaction.fee.toString(),
          fromCurrency: transaction.fromCurrency,
          toCurrency: transaction.toCurrency,
          exchangeRate: transaction.exchangeRate,
          convertedAmount: transaction.convertedAmount.toString(),
          note: transaction.note,
          createdAt: transaction.createdAt,
        },
        sender: {
          walletId: updatedSenderWallet.id,
          newBalance: updatedSenderWallet.balance.toString(),
          currency: senderCurrency,
        },
        recipient: {
          walletId: updatedRecipientWallet.id,
          newBalance: updatedRecipientWallet.balance.toString(),
          currency: recipientCurrency,
          phone: recipientPhone,
        },
      };

      await tx.idempotencyKey.create({
        data: {
          key: idempotencyKey,
          userId: senderUserId,
          endpoint,
          requestHash,
          responseBody: JSON.stringify(responsePayload),
        },
      });

      return responsePayload;
    });

    await AuditService.logTransfer({
      actorUserId: sender.id,
      targetUserId: recipient.id,
      ip,
      userAgent,
      requestId,
      correlationId,
      amount,
      fee: Number(fee),
      currency: senderCurrency,
      transactionId: result.transaction.id,
      fromWalletId: senderWallet.id,
      toWalletId: recipientWallet.id,
      status: "SUCCESS",
    });

    return result;
  }

  // ── DÉPÔT ─────────────────────────────────────

  static async deposit(input: DepositInput) {
    const { userId, amount, currency, note, requestId = null } = input;

    if (!Number.isInteger(amount) || amount <= 0) {
      throw new TransactionError("Le montant doit être un entier positif.", 400);
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { wallets: true },
    });
    if (!user) throw new TransactionError("Utilisateur introuvable.", 404);
    if (user.status !== "ACTIVE") throw new TransactionError("Compte inactif.", 403);

    let wallet = user.wallets.find((w) => w.currency === currency && w.isActive);
    if (!wallet) {
      wallet = await prisma.wallet.create({
        data: { userId, currency, balance: 0n, isActive: true },
      });
    }

    const amountBigInt = BigInt(amount);
    const reference = this.generateReference();

    let systemWallet = await prisma.wallet.findFirst({
      where: { user: { role: "SYSTEM" }, currency },
    });

    if (!systemWallet) {
      throw new TransactionError("Wallet système introuvable pour ce dépôt.", 500);
    }

    const updatedWallet = await prisma.$transaction(async (tx) => {
      const updated = await tx.wallet.update({
        where: { id: wallet!.id },
        data: { balance: { increment: amountBigInt } },
      });

      await tx.transaction.create({
        data: {
          type: "DEPOSIT",
          fromWalletId: systemWallet!.id,
          toWalletId: wallet!.id,
          amount: amountBigInt,
          fee: 0n,
          fromCurrency: currency,
          toCurrency: currency,
          exchangeRate: 1.0,
          convertedAmount: amountBigInt,
          status: "SUCCESS",
          reference,
          note: note || null,
        },
      });

      return updated;
    });

    return {
      message: "Dépôt effectué avec succès.",
      reference,
      wallet: {
        id: updatedWallet.id,
        currency,
        newBalance: updatedWallet.balance.toString(),
      },
    };
  }

  // ── RETRAIT ───────────────────────────────────

  static async withdraw(input: WithdrawInput) {
    const {
      userId, amount, currency, idempotencyKey, note,
      ip = null, userAgent = null, requestId = null, correlationId = null,
    } = input;

    if (!Number.isInteger(amount) || amount <= 0) {
      throw new TransactionError("Le montant doit être un entier positif.", 400);
    }
    if (!idempotencyKey) {
      throw new TransactionError("Le header x-idempotency-key est requis.", 400);
    }

    const endpoint = "POST:/api/transactions/withdraw";
    const requestHash = this.buildRequestHash({ senderUserId: userId, recipientPhone: "", amount, endpoint });

    const existingKey = await prisma.idempotencyKey.findFirst({
      where: { userId, endpoint, key: idempotencyKey },
    });
    if (existingKey) {
      return existingKey.responseBody
        ? JSON.parse(existingKey.responseBody)
        : { message: "Requête déjà traitée." };
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { wallets: true },
    });
    if (!user) throw new TransactionError("Utilisateur introuvable.", 404);
    if (user.status !== "ACTIVE") throw new TransactionError("Compte inactif.", 403);

    const wallet = user.wallets.find((w) => w.currency === currency && w.isActive);
    if (!wallet) throw new TransactionError(`Wallet ${currency} introuvable.`, 404);

    const amountBigInt = BigInt(amount);
    const fee = ExchangeService.calculateFee(amountBigInt, currency, currency);
    const totalDebit = amountBigInt + fee;

    if (wallet.balance < totalDebit) {
      throw new TransactionError(
        `Solde insuffisant. Disponible : ${wallet.balance} ${currency}, nécessaire : ${totalDebit} ${currency}.`,
        400
      );
    }

    const systemWallet = await prisma.wallet.findFirst({
      where: { user: { role: "SYSTEM" }, currency },
    });
    if (!systemWallet) throw new TransactionError("Wallet système introuvable.", 500);

    const reference = this.generateReference();

    const result = await prisma.$transaction(async (tx) => {
      const freshWallet = await tx.wallet.findUnique({ where: { id: wallet.id } });
      if (!freshWallet || freshWallet.balance < totalDebit) {
        throw new TransactionError("Solde insuffisant.", 400);
      }

      const updated = await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: freshWallet.balance - totalDebit },
      });

      // ── NOUVEAU : Crédit wallet SYSTEM avec les frais du retrait ──
      if (fee > 0n) {
        await tx.wallet.update({
          where: { id: systemWallet!.id },
          data: { balance: { increment: fee } },
        });
      }

      const transaction = await tx.transaction.create({
        data: {
          type: "WITHDRAW",
          fromWalletId: wallet.id,
          toWalletId: systemWallet!.id,
          amount: amountBigInt,
          fee,
          fromCurrency: currency,
          toCurrency: currency,
          exchangeRate: 1.0,
          convertedAmount: amountBigInt,
          status: "SUCCESS",
          reference,
          note: note || null,
        },
      });

      const responsePayload = {
        message: "Retrait effectué avec succès.",
        transaction: {
          id: transaction.id,
          reference,
          type: transaction.type,
          status: transaction.status,
          amount: transaction.amount.toString(),
          fee: transaction.fee.toString(),
          currency,
          createdAt: transaction.createdAt,
        },
        wallet: {
          id: updated.id,
          newBalance: updated.balance.toString(),
          currency,
        },
      };

      await tx.idempotencyKey.create({
        data: {
          key: idempotencyKey,
          userId,
          endpoint,
          requestHash,
          responseBody: JSON.stringify(responsePayload),
        },
      });

      return responsePayload;
    });

    return result;
  }

  // ── WALLET(S) D'UN UTILISATEUR ────────────────

  static async getMyWallets(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { wallets: { where: { isActive: true } } },
    });
    if (!user) throw new TransactionError("Utilisateur introuvable.", 404);

    return user.wallets.map((w) => ({
      id: w.id,
      currency: w.currency,
      balance: w.balance.toString(),
      createdAt: w.createdAt,
      updatedAt: w.updatedAt,
    }));
  }

  // ── HISTORIQUE DES TRANSACTIONS ───────────────

  static async getMyTransactions(userId: string, pagination: PaginationInput = {}) {
    const { page = 1, limit = 20, currency, type } = pagination;
    const skip = (page - 1) * limit;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { wallets: { where: { isActive: true } } },
    });
    if (!user) throw new TransactionError("Utilisateur introuvable.", 404);

    const walletIds = user.wallets
      .filter((w) => !currency || w.currency === currency)
      .map((w) => w.id);

    if (walletIds.length === 0) return { transactions: [], total: 0, page, limit };

    const where = {
      OR: [
        { fromWalletId: { in: walletIds } },
        { toWalletId: { in: walletIds } },
      ],
      ...(type ? { type } : {}),
    };

    const [transactions, total] = await Promise.all([
      prisma.transaction.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.transaction.count({ where }),
    ]);

    return {
      transactions: transactions.map((tx) => ({
        id: tx.id,
        reference: tx.reference,
        type: tx.type,
        status: tx.status,
        amount: tx.amount.toString(),
        fee: tx.fee.toString(),
        fromCurrency: tx.fromCurrency,
        toCurrency: tx.toCurrency,
        exchangeRate: tx.exchangeRate,
        convertedAmount: tx.convertedAmount.toString(),
        note: tx.note,
        fromWalletId: tx.fromWalletId,
        toWalletId: tx.toWalletId,
        createdAt: tx.createdAt,
        direction: walletIds.includes(tx.fromWalletId) ? "SENT" : "RECEIVED",
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  // ── HELPERS PRIVÉS ────────────────────────────

  private static buildRequestHash(input: {
    senderUserId: string;
    recipientPhone: string;
    amount: number;
    endpoint: string;
  }) {
    return crypto
      .createHash("sha256")
      .update(JSON.stringify(input))
      .digest("hex");
  }

  private static generateReference(): string {
    const date = new Date();
    const dateStr =
      date.getFullYear().toString() +
      String(date.getMonth() + 1).padStart(2, "0") +
      String(date.getDate()).padStart(2, "0");
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `TXN-${dateStr}-${random}`;
  }
}
