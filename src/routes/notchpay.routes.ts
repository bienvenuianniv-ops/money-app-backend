// src/routes/notchpay.routes.ts
// Endpoints Notchpay : dépôt, retrait, webhook, canaux

import { Router, Request, Response, NextFunction } from "express";
import { requireAuth } from "../middleware/auth";
import { notchpay, NotchpayService } from "../services/payment-providers/notchpay.service";
import { prisma } from "../db";
import { AuditService } from "../services/audit.service";

const router = Router();

// ─────────────────────────────────────────────
// CANAUX DISPONIBLES PAR PAYS
// ─────────────────────────────────────────────

/**
 * GET /api/notchpay/channels/:countryCode
 * ex: GET /api/notchpay/channels/SN
 * Retourne les opérateurs Mobile Money disponibles
 */
router.get(
  "/notchpay/channels/:countryCode",
  requireAuth,
  (req: Request, res: Response) => {
    const channels = NotchpayService.getChannels(req.params.countryCode);

    if (channels.length === 0) {
      return res.status(404).json({
        success: false,
        message: `Aucun canal disponible pour le pays : ${req.params.countryCode}`,
      });
    }

    return res.status(200).json({ success: true, data: channels });
  }
);

// ─────────────────────────────────────────────
// DÉPÔT
// ─────────────────────────────────────────────

/**
 * POST /api/notchpay/deposit
 *
 * Body: {
 *   amount: number,
 *   currency: string,     // XOF, XAF, EUR
 *   phone: string,
 *   name: string,
 *   email: string,
 *   description?: string
 * }
 */
router.post(
  "/notchpay/deposit",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { amount, currency, phone, name, email, description } = req.body;

      if (!amount || !currency || !phone || !name || !email) {
        return res.status(400).json({
          success: false,
          message: "amount, currency, phone, name et email sont requis.",
        });
      }

      if (!Number.isInteger(amount) || amount <= 0) {
        return res.status(400).json({
          success: false,
          message: "Le montant doit être un entier positif.",
        });
      }

      // Référence unique
      const reference = `DEP-NP-${req.user.id.slice(0, 8)}-${Date.now()}`;

      const result = await notchpay.initiateDeposit({
        amount,
        currency,
        phone,
        name,
        email,
        reference,
        description: description || `Dépôt PayWest ${amount} ${currency}`,
      });

      await AuditService.log({
        action: "NOTCHPAY_DEPOSIT_INITIATED",
        actorUserId: req.user.id,
        severity: "INFO",
        ip: req.ip ?? null,
        metadata: { amount, currency, reference },
      });

      return res.status(200).json({
        success: true,
        data: {
          reference:        result.reference,
          authorizationUrl: result.authorizationUrl,
          status:           result.status,
          message:          "Cliquez sur le lien pour compléter le paiement.",
          instructions:     `Ouvrez ce lien dans votre navigateur et payez ${amount} ${currency} via votre opérateur Mobile Money.`,
        },
      });
    } catch (error: any) {
      return res.status(502).json({
        success: false,
        message: `Erreur Notchpay: ${error.message}`,
      });
    }
  }
);

// ─────────────────────────────────────────────
// RETRAIT
// ─────────────────────────────────────────────

/**
 * POST /api/notchpay/withdraw
 * Header: x-idempotency-key
 *
 * Body: {
 *   amount: number,
 *   currency: string,
 *   phone: string,
 *   channel: string,    // ex: sn.wave | sn.orange | cm.mtn
 *   name: string,
 *   email?: string
 * }
 */
router.post(
  "/notchpay/withdraw",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { amount, currency, phone, channel, name, email } = req.body;

      if (!amount || !currency || !phone || !channel || !name) {
        return res.status(400).json({
          success: false,
          message: "amount, currency, phone, channel et name sont requis.",
        });
      }

      if (!Number.isInteger(amount) || amount <= 0) {
        return res.status(400).json({
          success: false,
          message: "Le montant doit être un entier positif.",
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

      const fee = BigInt(Math.round(amount * 0.01)); // 1% de frais
      const totalDebit = BigInt(amount) + fee;

      if (wallet.balance < totalDebit) {
        return res.status(400).json({
          success: false,
          message: `Solde insuffisant. Disponible: ${wallet.balance} ${currency}, requis: ${totalDebit} ${currency} (dont ${fee} de frais).`,
        });
      }

      const reference = `WD-NP-${req.user.id.slice(0, 8)}-${Date.now()}`;

      const result = await notchpay.initiateWithdraw({
        amount,
        currency,
        phone,
        channel,
        name,
        email,
        reference,
      });

      if (result.success) {
        // Débiter le wallet
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
            data: { balance: fresh.balance - totalDebit },
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
                note:            `Retrait via Notchpay (${channel}) vers ${phone}`,
              },
            });
          }
        });

        await AuditService.log({
          action:       "NOTCHPAY_WITHDRAW_INITIATED",
          actorUserId:  req.user.id,
          severity:     "INFO",
          ip:           req.ip ?? null,
          metadata:     { amount, currency, channel, phone, reference },
        });
      }

      return res.status(200).json({
        success: result.success,
        data: {
          reference,
          channel,
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
        message: `Erreur Notchpay: ${error.message}`,
      });
    }
  }
);

// ─────────────────────────────────────────────
// VÉRIFICATION DU STATUT
// ─────────────────────────────────────────────

/**
 * GET /api/notchpay/status/:reference
 */
router.get(
  "/notchpay/status/:reference",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await notchpay.checkPaymentStatus(req.params.reference);
      return res.status(200).json({ success: true, data: result });
    } catch (error: any) {
      return res.status(502).json({
        success: false,
        message: `Erreur Notchpay: ${error.message}`,
      });
    }
  }
);

// ─────────────────────────────────────────────
// WEBHOOK
// ─────────────────────────────────────────────

/**
 * POST /api/webhooks/notchpay
 * Appelé automatiquement par Notchpay après un paiement
 */
router.post(
  "/webhooks/notchpay",
  async (req: Request, res: Response) => {
    try {
      console.log("[WEBHOOK] Notchpay:", JSON.stringify(req.body));

      const event = notchpay.parseWebhook(req.body);
      console.log("[WEBHOOK] Event parsé:", event);

      if (event.status === "complete" && event.reference) {
        // Extraire l'userId depuis la référence (format: DEP-NP-USERID-timestamp)
        const parts = event.reference.split("-");
        // userId partiel (8 premiers caractères)
        const userIdPartial = parts[2];

        if (userIdPartial) {
          // Trouver l'utilisateur par les premiers caractères de son ID
          const user = await prisma.user.findFirst({
            where: { id: { startsWith: userIdPartial } },
            include: { wallets: true },
          });

          if (user) {
            // Trouver ou créer le wallet
            let wallet = user.wallets.find(
              (w) => w.currency === event.currency && w.isActive
            );

            if (!wallet) {
              wallet = await prisma.wallet.create({
                data: {
                  userId:   user.id,
                  currency: event.currency,
                  balance:  0n,
                  isActive: true,
                },
              });
            }

            const systemWallet = await prisma.wallet.findFirst({
              where: { user: { role: "SYSTEM" }, currency: event.currency },
            });

            if (systemWallet) {
              await prisma.$transaction(async (tx) => {
                await tx.wallet.update({
                  where: { id: wallet!.id },
                  data: { balance: { increment: BigInt(event.amount) } },
                });

                await tx.transaction.create({
                  data: {
                    type:            "DEPOSIT",
                    fromWalletId:    systemWallet.id,
                    toWalletId:      wallet!.id,
                    amount:          BigInt(event.amount),
                    fee:             0n,
                    fromCurrency:    event.currency,
                    toCurrency:      event.currency,
                    exchangeRate:    1.0,
                    convertedAmount: BigInt(event.amount),
                    status:          "SUCCESS",
                    reference:       event.reference,
                    note:            `Dépôt confirmé via Notchpay`,
                  },
                });
              });

              console.log(`[WEBHOOK] Wallet crédité: ${event.amount} ${event.currency} pour user ${user.id}`);
            }
          }
        }
      }

      return res.status(200).json({ received: true });
    } catch (error) {
      console.error("[WEBHOOK] Notchpay erreur:", error);
      return res.status(200).json({ received: true });
    }
  }
);

export default router;
