// src/routes/paydunya.routes.ts
// Endpoints PayDunya : dépôt, webhook, statut

import { Router, Request, Response, NextFunction } from "express";
import { requireAuth } from "../middleware/auth";
import { paydunya } from "../services/payment-providers/paydunya.service";
import { prisma } from "../db";
import { AuditService } from "../services/audit.service";

const router = Router();

const RETURN_URL = "https://mayouservice.com/pay/app.html";
const CANCEL_URL = "https://mayouservice.com/pay/app.html";
const IPN_URL    = "https://paywest-backend.onrender.com/api/webhooks/paydunya";

// ─────────────────────────────────────────────────────────────
// DÉPÔT
// ─────────────────────────────────────────────────────────────

router.post(
  "/paydunya/deposit",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { amount, currency, description, customerName } = req.body;

      if (!amount || !currency) {
        return res.status(400).json({ success: false, message: "amount et currency sont requis." });
      }

      if (!Number.isInteger(amount) || amount <= 0) {
        return res.status(400).json({ success: false, message: "Le montant doit être un entier positif." });
      }

      const user = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: { id: true, phone: true },
      });

      const name = customerName || (user?.phone ? `Client ${user.phone}` : "Client PayWest");
      const reference = `DEP-PD-${req.user.id.slice(0, 8)}-${Date.now()}`;

      const result = await paydunya.initiateDeposit({
        amount, currency,
        description: description || `Dépôt PayWest ${amount} ${currency}`,
        reference,
        customerName: name,
        returnUrl: RETURN_URL,
        cancelUrl: CANCEL_URL,
        ipnUrl: IPN_URL,
      });

      await AuditService.log({
        action: "PAYDUNYA_DEPOSIT_INITIATED",
        actorUserId: req.user.id,
        severity: "INFO",
        ip: req.ip ?? null,
        metadata: { amount, currency, reference },
      });

      return res.status(200).json({
        success: true,
        data: {
          token:       result.token,
          redirectUrl: result.redirectUrl,
          reference:   result.reference,
          status:      result.status,
          message:     "Cliquez sur le lien pour compléter le paiement.",
        },
      });
    } catch (error: any) {
      return res.status(502).json({ success: false, message: `Erreur PayDunya: ${error.message}` });
    }
  }
);

// ─────────────────────────────────────────────────────────────
// VÉRIFICATION DU STATUT
// ─────────────────────────────────────────────────────────────

router.get(
  "/paydunya/status/:token",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const result = await paydunya.checkPaymentStatus(req.params.token as string);
      return res.status(200).json({ success: true, data: result });
    } catch (error: any) {
      return res.status(502).json({ success: false, message: `Erreur PayDunya: ${error.message}` });
    }
  }
);

// ─────────────────────────────────────────────────────────────
// WEBHOOK IPN
// ─────────────────────────────────────────────────────────────

router.post(
  "/webhooks/paydunya",
  async (req: Request, res: Response) => {
    try {
      console.log("[WEBHOOK] PayDunya body:", JSON.stringify(req.body));
      console.log("[WEBHOOK] PayDunya query:", JSON.stringify(req.query));
      console.log("[WEBHOOK] PayDunya headers:", JSON.stringify(req.headers));

      const token = req.query.token || req.body?.data?.invoice?.token || req.body?.token;
      console.log("[WEBHOOK] PayDunya token reçu:", token);

      if (!token) {
        console.log("[WEBHOOK] PayDunya: pas de token, on ignore");
        return res.status(200).json({ received: true });
      }

      const statusResult = await paydunya.checkPaymentStatus(token as string);
      console.log("[WEBHOOK] PayDunya statut:", JSON.stringify(statusResult));

      if (statusResult.status === "complete" || statusResult.status === "completed") {
        const reference = statusResult.raw?.custom_data?.reference || "";
        console.log("[WEBHOOK] PayDunya référence:", reference);

        if (reference) {
          const parts = reference.split("-");
          const userIdPartial = parts[2];

          if (userIdPartial) {
            const user = await prisma.user.findFirst({
              where: { id: { startsWith: userIdPartial } },
              include: { wallets: true },
            });

            if (user) {
              let wallet = user.wallets.find((w) => w.currency === "XOF" && w.isActive);

              if (!wallet) {
                wallet = await prisma.wallet.create({
                  data: { userId: user.id, currency: "XOF", balance: 0n, isActive: true },
                });
              }

              const systemWallet = await prisma.wallet.findFirst({
                where: { user: { role: "SYSTEM" }, currency: "XOF" },
              });

              if (systemWallet) {
                await prisma.$transaction(async (tx) => {
                  await tx.wallet.update({
                    where: { id: wallet!.id },
                    data: { balance: { increment: BigInt(statusResult.amount) } },
                  });

                  await tx.transaction.create({
                    data: {
                      type: "DEPOSIT",
                      fromWalletId: systemWallet.id,
                      toWalletId: wallet!.id,
                      amount: BigInt(statusResult.amount),
                      fee: 0n,
                      fromCurrency: "XOF",
                      toCurrency: "XOF",
                      exchangeRate: 1.0,
                      convertedAmount: BigInt(statusResult.amount),
                      status: "SUCCESS",
                      reference,
                      note: "Dépôt confirmé via PayDunya",
                    },
                  });
                });

                console.log(`[WEBHOOK] PayDunya wallet crédité: ${statusResult.amount} XOF pour user ${user.id}`);
              }
            }
          }
        }
      }

      return res.status(200).json({ received: true });
    } catch (error) {
      console.error("[WEBHOOK] PayDunya erreur:", error);
      return res.status(200).json({ received: true });
    }
  }
);

// ─────────────────────────────────────────────────────────────
// RETRAIT avec vrai déboursement PayDunya
// ─────────────────────────────────────────────────────────────

router.post(
  "/paydunya/withdraw",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { amount, currency, phone, operator, name } = req.body;

      if (!amount || !phone || !operator) {
        return res.status(400).json({
          success: false,
          message: "amount, phone et operator sont requis.",
        });
      }

      // Formater le numéro avec indicatif pays
      const formattedPhone = phone.startsWith('+') ? phone : `+221${phone}`;

      const user = await prisma.user.findUnique({
        where: { id: req.user.id },
        include: { wallets: true },
      });

      if (!user) {
        return res.status(404).json({ success: false, message: "Utilisateur introuvable." });
      }

      const wallet = user.wallets.find((w) => w.currency === (currency || "XOF") && w.isActive);

      if (!wallet || wallet.balance < BigInt(amount)) {
        return res.status(400).json({ success: false, message: "Solde insuffisant." });
      }

      const fee = 0; // Retrait gratuit — stratégie d'acquisition
      const totalDeducted = amount + fee;

      if (wallet.balance < BigInt(totalDeducted)) {
        return res.status(400).json({ success: false, message: "Solde insuffisant pour couvrir les frais." });
      }

      const reference = `WD-PD-${req.user.id.slice(0, 8)}-${Date.now()}`;

      // Déduire le solde du wallet PayWest
      await prisma.wallet.update({
        where: { id: wallet.id },
        data: { balance: { decrement: BigInt(totalDeducted) } },
      });

      // Enregistrer la transaction
      const systemWallet = await prisma.wallet.findFirst({
        where: { user: { role: "SYSTEM" }, currency: currency || "XOF" },
      });

      if (systemWallet) {
        await prisma.transaction.create({
          data: {
            type: "WITHDRAW",
            fromWalletId: wallet.id,
            toWalletId: systemWallet.id,
            amount: BigInt(amount),
            fee: BigInt(fee),
            fromCurrency: currency || "XOF",
            toCurrency: currency || "XOF",
            exchangeRate: 1.0,
            convertedAmount: BigInt(amount),
            status: "SUCCESS",
            reference,
            note: `Retrait vers ${formattedPhone} via ${operator}`,
          },
        });
      }

      // Envoyer l'argent via PayDunya déboursement
      try {
        const disbResult = await paydunya.sendMoney({
          amount,
          phone: formattedPhone,
          operator,
          name: name || `Client ${user.phone}`,
          reference,
          note: `Retrait PayWest ${amount} XOF`,
        });
        console.log("[WITHDRAW] PayDunya déboursement:", JSON.stringify(disbResult));
      } catch (disbErr: any) {
        console.error("[WITHDRAW] Erreur déboursement PayDunya:", disbErr.message);
      }

      await AuditService.log({
        action: "PAYDUNYA_WITHDRAW_INITIATED",
        actorUserId: req.user.id,
        severity: "INFO",
        ip: req.ip ?? null,
        metadata: { amount, currency, reference, phone: formattedPhone, operator },
      });

      return res.status(200).json({
        success: true,
        data: {
          reference,
          amount,
          fee,
          phone: formattedPhone,
          operator,
          message: `Retrait de ${amount} XOF initié vers ${formattedPhone}. Vous recevrez l'argent sous peu.`,
        },
      });
    } catch (error: any) {
      return res.status(502).json({ success: false, message: `Erreur retrait: ${error.message}` });
    }
  }
);

export default router;