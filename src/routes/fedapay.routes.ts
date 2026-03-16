// src/routes/fedapay.routes.ts
// Endpoints FedaPay : dépôt, retrait, statut, webhook

import { Router, Request, Response, NextFunction } from "express";
import { requireAuth } from "../middleware/auth";
import { fedapay, FedaPayService } from "../services/payment-providers/fedapay.service";
import { prisma } from "../db";
import { AuditService } from "../services/audit.service";

const router = Router();

// ─────────────────────────────────────────────
// MOYENS DE PAIEMENT PAR PAYS
// ─────────────────────────────────────────────

/**
 * GET /api/fedapay/methods/:countryCode
 * ex: GET /api/fedapay/methods/SN
 */
router.get(
  "/fedapay/methods/:countryCode",
  requireAuth,
  (req: Request, res: Response) => {
    const methods = FedaPayService.getPaymentMethods(req.params.countryCode);
    if (methods.length === 0) {
      return res.status(404).json({
        success: false,
        message: `Aucun moyen de paiement disponible pour : ${req.params.countryCode}`,
      });
    }
    return res.status(200).json({ success: true, data: methods });
  }
);

// ─────────────────────────────────────────────
// DÉPÔT
// ─────────────────────────────────────────────

/**
 * POST /api/fedapay/deposit
 *
 * Body: {
 *   amount: number,
 *   currency: string,     // XOF, XAF, GNF
 *   firstName: string,
 *   lastName: string,
 *   email: string,
 *   phone: string,
 *   description?: string
 * }
 */
router.post(
  "/fedapay/deposit",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { amount, currency, firstName, lastName, email, phone, description } = req.body;

      if (!amount || !currency || !firstName || !lastName || !email || !phone) {
        return res.status(400).json({
          success: false,
          message: "amount, currency, firstName, lastName, email et phone sont requis.",
        });
      }

      if (!Number.isInteger(amount) || amount <= 0) {
        return res.status(400).json({
          success: false,
          message: "Le montant doit être un entier positif.",
        });
      }

      const reference = `DEP-FP-${req.user.id.slice(0, 8)}-${Date.now()}`;

      const result = await fedapay.initiateDeposit({
        amount,
        currency,
        description: description || `Dépôt PayWest ${amount} ${currency}`,
        firstName,
        lastName,
        email,
        phone,
        reference,
      });

      await AuditService.log({
        action:      "FEDAPAY_DEPOSIT_INITIATED",
        actorUserId: req.user.id,
        severity:    "INFO",
        ip:          req.ip ?? null,
        metadata:    { amount, currency, reference, transactionId: result.id },
      });

      return res.status(200).json({
        success: true,
        data: {
          transactionId: result.id,
          reference:     result.reference,
          paymentUrl:    result.paymentUrl,
          status:        result.status,
          amount,
          currency,
          message:       "Cliquez sur le lien pour compléter le paiement via Mobile Money.",
        },
      });
    } catch (error: any) {
      return res.status(502).json({
        success: false,
        message: `Erreur FedaPay: ${error.message}`,
      });
    }
  }
);

// ─────────────────────────────────────────────
// VÉRIFICATION DU STATUT
// ─────────────────────────────────────────────

/**
 * GET /api/fedapay/status/:transactionId
 */
router.get(
  "/fedapay/status/:transactionId",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await fedapay.checkTransactionStatus(
        parseInt(req.params.transactionId)
      );
      return res.status(200).json({ success: true, data: result });
    } catch (error: any) {
      return res.status(502).json({
        success: false,
        message: `Erreur FedaPay: ${error.message}`,
      });
    }
  }
);

// ─────────────────────────────────────────────
// RETRAIT
// ─────────────────────────────────────────────

/**
 * POST /api/fedapay/withdraw
 *
 * Body: {
 *   amount: number,
 *   currency: string,
 *   phone: string,
 *   firstName: string,
 *   lastName: string,
 *   email: string
 * }
 */
router.post(
  "/fedapay/withdraw",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { amount, currency, phone, firstName, lastName, email } = req.body;

      if (!amount || !currency || !phone || !firstName || !lastName || !email) {
        return res.status(400).json({
          success: false,
          message: "Tous les champs sont requis.",
        });
      }

      // Vérifier le solde
      const wallet = await prisma.wallet.findFirst({
        where: { userId: req.user.id, currency, isActive: true },
      });

      if (!wallet) {
        return res.status(404).json({
          success: false,
          message: `Wallet ${currency} introuvable.`,
        });
      }

      const fee        = BigInt(Math.round(amount * 0.01));
      const totalDebit = BigInt(amount) + fee;

      if (wallet.balance < totalDebit) {
        return res.status(400).json({
          success: false,
          message: `Solde insuffisant. Disponible: ${wallet.balance} ${currency}, requis: ${totalDebit} ${currency}.`,
        });
      }

      const reference = `WD-FP-${req.user.id.slice(0, 8)}-${Date.now()}`;

      const result = await fedapay.initiateWithdraw({
        amount,
        currency,
        phone,
        firstName,
        lastName,
        email,
        reference,
      });

      if (result.success) {
        const systemWallet = await prisma.wallet.findFirst({
          where: { user: { role: "SYSTEM" }, currency },
        });

        await prisma.$transaction(async (tx) => {
          const fresh = await tx.wallet.findUnique({ where: { id: wallet.id } });
          if (!fresh || fresh.balance < totalDebit) {
            throw new Error("Solde insuffisant.");
          }

          await tx.wallet.update({
            where: { id: wallet.id },
            data:  { balance: fresh.balance - totalDebit },
          });

          if (systemWallet) {
            await tx.transaction.create({
              data: {
                type:            "WITHDRAW",
                fromWalletId:    wallet.id,
                toWalletId:      systemWallet.id,
                amount:          BigInt(amount),
                fee,
                fromCurrency:    currency,
                toCurrency:      currency,
                exchangeRate:    1.0,
                convertedAmount: BigInt(amount),
                status:          "PENDING",
                reference,
                note:            `Retrait via FedaPay vers ${phone}`,
              },
            });
          }
        });

        await AuditService.log({
          action:      "FEDAPAY_WITHDRAW_INITIATED",
          actorUserId: req.user.id,
          severity:    "INFO",
          ip:          req.ip ?? null,
          metadata:    { amount, currency, phone, reference },
        });
      }

      return res.status(200).json({
        success: result.success,
        data: {
          reference,
          amount,
          fee:     Number(fee),
          currency,
          phone,
          status:  result.success ? "PENDING" : "FAILED",
          message: result.message,
        },
      });
    } catch (error: any) {
      return res.status(502).json({
        success: false,
        message: `Erreur FedaPay: ${error.message}`,
      });
    }
  }
);

// ─────────────────────────────────────────────
// WEBHOOK
// ─────────────────────────────────────────────

/**
 * POST /api/webhooks/fedapay
 */
router.post(
  "/webhooks/fedapay",
  async (req: Request, res: Response) => {
    try {
      console.log("[WEBHOOK] FedaPay:", JSON.stringify(req.body));

      const event = fedapay.parseWebhook(req.body);
      console.log("[WEBHOOK] FedaPay event:", event);

      if (event.status === "approved" && event.id) {
        // Chercher la transaction en base par référence
        const tx = await prisma.transaction.findFirst({
          where: {
            note: { contains: `FedaPay` },
            status: "PENDING",
          },
          include: { toWallet: true },
        });

        if (tx && tx.toWallet) {
          await prisma.$transaction(async (db) => {
            await db.wallet.update({
              where: { id: tx.toWallet!.id },
              data:  { balance: { increment: BigInt(event.amount) } },
            });

            await db.transaction.update({
              where: { id: tx.id },
              data:  { status: "SUCCESS" },
            });
          });

          console.log(`[WEBHOOK] FedaPay: wallet crédité ${event.amount} ${event.currency}`);
        }
      }

      return res.status(200).json({ received: true });
    } catch (error) {
      console.error("[WEBHOOK] FedaPay erreur:", error);
      return res.status(200).json({ received: true });
    }
  }
);

export default router;
