// src/routes/transactions.routes.ts

import { Router, Request, Response, NextFunction } from "express";
import { requireAuth } from "../middleware/auth";
import { TransactionsService, TransactionError } from "../services/transactions.service";
import { ExchangeService } from "../services/exchange.service";

const router = Router();

// Helper : gestion des erreurs uniformisée
const handleError = (error: unknown, res: Response, next: NextFunction) => {
  if (error instanceof TransactionError) {
    return res.status(error.statusCode).json({ success: false, message: error.message });
  }
  return next(error);
};

// ─────────────────────────────────────────────
// WALLETS
// ─────────────────────────────────────────────

/**
 * GET /api/wallets
 * Retourne tous les wallets de l'utilisateur connecté
 */
router.get(
  "/wallets",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const wallets = await TransactionsService.getMyWallets(req.user.id);
      return res.status(200).json({ success: true, data: wallets });
    } catch (error) {
      return handleError(error, res, next);
    }
  }
);

// ─────────────────────────────────────────────
// TRANSACTIONS
// ─────────────────────────────────────────────

/**
 * POST /api/transactions/transfer
 * Transfert P2P entre deux utilisateurs (multi-devises)
 * 
 * Body: { recipientPhone, amount, currency?, note? }
 * Header: x-idempotency-key
 */
router.post(
  "/transactions/transfer",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { recipientPhone, amount, currency, note } = req.body;
      const idempotencyKey = req.headers["x-idempotency-key"] as string;

      const result = await TransactionsService.transfer({
        senderUserId: req.user.id,
        recipientPhone,
        amount,
        currency,
        note,
        idempotencyKey,
        ip: req.ip ?? null,
        userAgent: req.get("user-agent") ?? null,
        requestId: req.headers["x-request-id"] as string ?? null,
        correlationId: req.headers["x-correlation-id"] as string ?? null,
      });

      return res.status(200).json({ success: true, data: result });
    } catch (error) {
      return handleError(error, res, next);
    }
  }
);

/**
 * POST /api/transactions/deposit
 * Dépôt sur un wallet (réservé aux admins/système en production)
 * 
 * Body: { amount, currency, note? }
 */
router.post(
  "/transactions/deposit",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { amount, currency, note } = req.body;

      const result = await TransactionsService.deposit({
        userId: req.user.id,
        amount,
        currency,
        note,
        requestId: req.headers["x-request-id"] as string ?? null,
      });

      return res.status(200).json({ success: true, data: result });
    } catch (error) {
      return handleError(error, res, next);
    }
  }
);

/**
 * POST /api/transactions/withdraw
 * Retrait depuis un wallet
 * 
 * Body: { amount, currency, note? }
 * Header: x-idempotency-key
 */
router.post(
  "/transactions/withdraw",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { amount, currency, note } = req.body;
      const idempotencyKey = req.headers["x-idempotency-key"] as string;

      const result = await TransactionsService.withdraw({
        userId: req.user.id,
        amount,
        currency,
        idempotencyKey,
        note,
        ip: req.ip ?? null,
        userAgent: req.get("user-agent") ?? null,
        requestId: req.headers["x-request-id"] as string ?? null,
        correlationId: req.headers["x-correlation-id"] as string ?? null,
      });

      return res.status(200).json({ success: true, data: result });
    } catch (error) {
      return handleError(error, res, next);
    }
  }
);

/**
 * GET /api/transactions
 * Historique des transactions avec pagination et filtres
 * 
 * Query: ?page=1&limit=20&currency=XOF&type=TRANSFER
 */
router.get(
  "/transactions",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
      const currency = req.query.currency as string | undefined;
      const type = req.query.type as "TRANSFER" | "DEPOSIT" | "WITHDRAW" | undefined;

      const result = await TransactionsService.getMyTransactions(req.user.id, {
        page,
        limit,
        currency,
        type,
      });

      return res.status(200).json({ success: true, data: result });
    } catch (error) {
      return handleError(error, res, next);
    }
  }
);

// ─────────────────────────────────────────────
// TAUX DE CHANGE
// ─────────────────────────────────────────────

/**
 * GET /api/exchange/rates
 * Retourne tous les taux de change actifs
 */
router.get(
  "/exchange/rates",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const rates = await ExchangeService.getAllRates();
      return res.status(200).json({ success: true, data: rates });
    } catch (error) {
      return next(error);
    }
  }
);

/**
 * GET /api/exchange/convert?from=XOF&to=EUR&amount=10000
 * Simule une conversion sans effectuer de transaction
 */
router.get(
  "/exchange/convert",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { from, to, amount } = req.query;

      if (!from || !to || !amount) {
        return res.status(400).json({
          success: false,
          message: "Paramètres requis : from, to, amount",
        });
      }

      const amountNum = parseInt(amount as string);
      if (isNaN(amountNum) || amountNum <= 0) {
        return res.status(400).json({ success: false, message: "Montant invalide." });
      }

      const { convertedAmount, rate } = await ExchangeService.convert(
        BigInt(amountNum),
        from as string,
        to as string
      );

      const fee = ExchangeService.calculateFee(BigInt(amountNum), from as string, to as string);

      return res.status(200).json({
        success: true,
        data: {
          from,
          to,
          amount: amountNum,
          rate,
          convertedAmount: convertedAmount.toString(),
          fee: fee.toString(),
          totalToSend: (BigInt(amountNum) + fee).toString(),
        },
      });
    } catch (error) {
      return next(error);
    }
  }
);

export default router;
