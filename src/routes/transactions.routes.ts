import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { requireAuth } from "../middleware/auth";
import { requireIdempotency, finalizeIdempotency } from "../middleware/idempotency";
import { TransactionsService } from "../services/transactions.service";
import { computeTransferFee } from "../config/fees";

const router = Router();

/**
 * GET /transactions
 */
router.get("/transactions", requireAuth, async (req, res) => {
  try {
    const userId = (req as any).user.id as string;

    const wallet = await prisma.wallet.findFirst({ where: { userId } });
    if (!wallet) return res.status(404).json({ ok: false, message: "Wallet introuvable" });

    const txs = await prisma.transaction.findMany({
      where: { OR: [{ fromWalletId: wallet.id }, { toWalletId: wallet.id }] },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
type: true,
type: true,
        fromWalletId: true,
        toWalletId: true,
        amount: true,
        fee: true,
        status: true,
        createdAt: true,
      },
    });

    const formatted = txs.map((t) => {
      const direction = t.fromWalletId === wallet.id ? "OUT" : "IN";
      const amount = t.amount;
      const fee = t.fee ?? 0n;

      return {
        id: t.id,
type: t.type,
type: t.type,
        fromWalletId: t.fromWalletId,
        toWalletId: t.toWalletId,
        amount: amount.toString(),
        fee: fee.toString(),
        status: t.status,
        createdAt: t.createdAt,
        direction,
        cost: (direction === "OUT" ? amount + fee : 0n).toString(),
        received: (direction === "IN" ? amount : 0n).toString(),
      };
    });

    return res.json({ ok: true, walletId: wallet.id, transactions: formatted });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, message: "Erreur serveur" });
  }
});

const transferSchema = z.object({
  toWalletId: z.string().uuid(),
  amount: z.number().int().positive(),
});
const cashSchema = z.object({
  amount: z.number().int().positive(),
});

/**
 * POST /transactions/transfer
 * Order IMPORTANT:
 * requireAuth -> requireIdempotency -> finalizeIdempotency -> handler
 */
router.post(
  "/transactions/transfer",
  requireAuth,
  requireIdempotency,
  finalizeIdempotency,
  async (req, res) => {
    try {
      const userId = (req as any).user.id as string;
      const { toWalletId, amount } = transferSchema.parse(req.body);

// Calcul automatique des frais (1%, min 10, max 500)
const fee = computeTransferFee(amount);

const result = await TransactionsService.transfer({
  userId,
  toWalletId,
  amount,
  fee,
});
      return res.status(result.status).json(result.body);
    } catch (error: any) {
      if (error?.name === "ZodError") {
        return res.status(400).json({ ok: false, message: "Validation error", details: error.errors });
      }
      console.error(error);
      return res.status(500).json({ ok: false, message: "Erreur serveur" });
    }
  }
);
/**
 * POST /transactions/deposit
 */
router.post(
  "/transactions/deposit",
  requireAuth,
  requireIdempotency,
  finalizeIdempotency,
  async (req, res) => {
    try {
      const userId = (req as any).user.id as string;
      const { amount } = cashSchema.parse(req.body);

      const result = await TransactionsService.deposit({ userId, amount });
      return res.status(result.status).json(result.body);
    } catch (error: any) {
      if (error?.name === "ZodError") {
        return res.status(400).json({ ok: false, message: "Validation error", details: error.errors });
      }
      console.error(error);
      return res.status(500).json({ ok: false, message: "Erreur serveur" });
    }
  }
);
/**
 * POST /transactions/withdraw
 */
router.post(
  "/transactions/withdraw",
  requireAuth,
  requireIdempotency,
  finalizeIdempotency,
  async (req, res) => {
    try {
      const userId = (req as any).user.id as string;
      const { amount } = cashSchema.parse(req.body);

      const result = await TransactionsService.withdraw({ userId, amount });
      return res.status(result.status).json(result.body);
    } catch (error: any) {
      if (error?.name === "ZodError") {
        return res.status(400).json({ ok: false, message: "Validation error", details: error.errors });
      }
      console.error(error);
      return res.status(500).json({ ok: false, message: "Erreur serveur" });
    }
  }
);
export default router;