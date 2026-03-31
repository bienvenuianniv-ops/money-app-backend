"use strict";
// src/routes/paytech.routes.ts
// Endpoints PayTech : dépôt, webhook, statut
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const paytech_service_1 = require("../services/payment-providers/paytech.service");
const db_1 = require("../db");
const audit_service_1 = require("../services/audit.service");
const router = (0, express_1.Router)();
// ─────────────────────────────────────────────────────────────
// DÉPÔT
// ─────────────────────────────────────────────────────────────
/**
 * POST /api/paytech/deposit
 *
 * Body: {
 *   amount: number,
 *   currency: string,     // XOF
 *   description?: string
 * }
 */
router.post("/paytech/deposit", auth_1.requireAuth, async (req, res, next) => {
    try {
        const { amount, currency, description } = req.body;
        if (!amount || !currency) {
            return res.status(400).json({
                success: false,
                message: "amount et currency sont requis.",
            });
        }
        if (!Number.isInteger(amount) || amount <= 0) {
            return res.status(400).json({
                success: false,
                message: "Le montant doit être un entier positif.",
            });
        }
        const reference = `DEP-PT-${req.user.id.slice(0, 8)}-${Date.now()}`;
        const result = await paytech_service_1.paytech.initiateDeposit({
            amount,
            currency,
            itemName: description || `Dépôt PayWest ${amount} ${currency}`,
            itemPrice: amount,
            reference,
            customField: JSON.stringify({ userId: req.user.id, reference }),
        });
        await audit_service_1.AuditService.log({
            action: "PAYTECH_DEPOSIT_INITIATED",
            actorUserId: req.user.id,
            severity: "INFO",
            ip: req.ip ?? null,
            metadata: { amount, currency, reference },
        });
        return res.status(200).json({
            success: true,
            data: {
                reference: result.reference,
                redirectUrl: result.redirectUrl,
                token: result.token,
                status: result.status,
                message: "Cliquez sur le lien pour compléter le paiement.",
            },
        });
    }
    catch (error) {
        return res.status(502).json({
            success: false,
            message: `Erreur PayTech: ${error.message}`,
        });
    }
});
// ─────────────────────────────────────────────────────────────
// VÉRIFICATION DU STATUT
// ─────────────────────────────────────────────────────────────
/**
 * GET /api/paytech/status/:token
 */
router.get("/paytech/status/:token", auth_1.requireAuth, async (req, res, next) => {
    try {
        const result = await paytech_service_1.paytech.checkPaymentStatus(req.params.token);
        return res.status(200).json({ success: true, data: result });
    }
    catch (error) {
        return res.status(502).json({
            success: false,
            message: `Erreur PayTech: ${error.message}`,
        });
    }
});
// ─────────────────────────────────────────────────────────────
// WEBHOOK IPN
// ─────────────────────────────────────────────────────────────
/**
 * POST /api/webhooks/paytech
 * Appelé automatiquement par PayTech après un paiement
 */
router.post("/webhooks/paytech", async (req, res) => {
    try {
        console.log("[WEBHOOK] PayTech:", JSON.stringify(req.body));
        const event = paytech_service_1.paytech.parseWebhook(req.body);
        console.log("[WEBHOOK] PayTech event parsé:", event);
        if (event.status === "complete" && event.reference) {
            // Extraire l'userId depuis la référence (format: DEP-PT-USERID-timestamp)
            const parts = event.reference.split("-");
            const userIdPartial = parts[2];
            if (userIdPartial) {
                const user = await db_1.prisma.user.findFirst({
                    where: { id: { startsWith: userIdPartial } },
                    include: { wallets: true },
                });
                if (user) {
                    let wallet = user.wallets.find((w) => w.currency === event.currency && w.isActive);
                    if (!wallet) {
                        wallet = await db_1.prisma.wallet.create({
                            data: {
                                userId: user.id,
                                currency: event.currency,
                                balance: 0n,
                                isActive: true,
                            },
                        });
                    }
                    const systemWallet = await db_1.prisma.wallet.findFirst({
                        where: { user: { role: "SYSTEM" }, currency: event.currency },
                    });
                    if (systemWallet) {
                        await db_1.prisma.$transaction(async (tx) => {
                            await tx.wallet.update({
                                where: { id: wallet.id },
                                data: { balance: { increment: BigInt(event.amount) } },
                            });
                            await tx.transaction.create({
                                data: {
                                    type: "DEPOSIT",
                                    fromWalletId: systemWallet.id,
                                    toWalletId: wallet.id,
                                    amount: BigInt(event.amount),
                                    fee: 0n,
                                    fromCurrency: event.currency,
                                    toCurrency: event.currency,
                                    exchangeRate: 1.0,
                                    convertedAmount: BigInt(event.amount),
                                    status: "SUCCESS",
                                    reference: event.reference,
                                    note: "Dépôt confirmé via PayTech",
                                },
                            });
                        });
                        console.log(`[WEBHOOK] PayTech wallet crédité: ${event.amount} ${event.currency} pour user ${user.id}`);
                    }
                }
            }
        }
        return res.status(200).json({ received: true });
    }
    catch (error) {
        console.error("[WEBHOOK] PayTech erreur:", error);
        return res.status(200).json({ received: true });
    }
});
exports.default = router;
//# sourceMappingURL=paytech.routes.js.map