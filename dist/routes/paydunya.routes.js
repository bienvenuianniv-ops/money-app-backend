"use strict";
// src/routes/paydunya.routes.ts
// Endpoints PayDunya : dépôt, webhook, statut
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const paydunya_service_1 = require("../services/payment-providers/paydunya.service");
const db_1 = require("../db");
const audit_service_1 = require("../services/audit.service");
const router = (0, express_1.Router)();
const RETURN_URL = "https://mayouservice.com/pay/app.html";
const CANCEL_URL = "https://mayouservice.com/pay/app.html";
const IPN_URL = "https://paywest-backend.onrender.com/api/webhooks/paydunya";
// ─────────────────────────────────────────────────────────────
// DÉPÔT
// ─────────────────────────────────────────────────────────────
/**
 * POST /api/paydunya/deposit
 * Body: { amount, currency, description?, customerName? }
 */
router.post("/paydunya/deposit", auth_1.requireAuth, async (req, res, next) => {
    try {
        const { amount, currency, description, customerName } = req.body;
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
        const user = await db_1.prisma.user.findUnique({
            where: { id: req.user.id },
            select: { id: true, phone: true },
        });
        const name = customerName || (user?.phone ? `Client ${user.phone}` : "Client PayWest");
        const reference = `DEP-PD-${req.user.id.slice(0, 8)}-${Date.now()}`;
        const result = await paydunya_service_1.paydunya.initiateDeposit({
            amount,
            currency,
            description: description || `Dépôt PayWest ${amount} ${currency}`,
            reference,
            customerName: name,
            returnUrl: RETURN_URL,
            cancelUrl: CANCEL_URL,
            ipnUrl: IPN_URL,
        });
        await audit_service_1.AuditService.log({
            action: "PAYDUNYA_DEPOSIT_INITIATED",
            actorUserId: req.user.id,
            severity: "INFO",
            ip: req.ip ?? null,
            metadata: { amount, currency, reference },
        });
        return res.status(200).json({
            success: true,
            data: {
                token: result.token,
                redirectUrl: result.redirectUrl,
                reference: result.reference,
                status: result.status,
                message: "Cliquez sur le lien pour compléter le paiement.",
            },
        });
    }
    catch (error) {
        return res.status(502).json({
            success: false,
            message: `Erreur PayDunya: ${error.message}`,
        });
    }
});
// ─────────────────────────────────────────────────────────────
// VÉRIFICATION DU STATUT
// ─────────────────────────────────────────────────────────────
/**
 * GET /api/paydunya/status/:token
 */
router.get("/paydunya/status/:token", auth_1.requireAuth, async (req, res) => {
    try {
        const result = await paydunya_service_1.paydunya.checkPaymentStatus(req.params.token);
        return res.status(200).json({ success: true, data: result });
    }
    catch (error) {
        return res.status(502).json({
            success: false,
            message: `Erreur PayDunya: ${error.message}`,
        });
    }
});
// ─────────────────────────────────────────────────────────────
// WEBHOOK IPN
// ─────────────────────────────────────────────────────────────
/**
 * POST /api/webhooks/paydunya
 */
router.post("/webhooks/paydunya", async (req, res) => {
    try {
        const body = req.body && Object.keys(req.body).length > 0 ? req.body : req.query;
        console.log("[WEBHOOK] PayDunya:", JSON.stringify(body));
        const event = paydunya_service_1.paydunya.parseWebhook(body);
        console.log("[WEBHOOK] PayDunya event parsé:", event);
        if (event.status === "complete" && event.reference) {
            const parts = event.reference.split("-");
            const userIdPartial = parts[2];
            if (userIdPartial) {
                const user = await db_1.prisma.user.findFirst({
                    where: { id: { startsWith: userIdPartial } },
                    include: { wallets: true },
                });
                if (user) {
                    let wallet = user.wallets.find((w) => w.currency === "XOF" && w.isActive);
                    if (!wallet) {
                        wallet = await db_1.prisma.wallet.create({
                            data: { userId: user.id, currency: "XOF", balance: 0n, isActive: true },
                        });
                    }
                    const systemWallet = await db_1.prisma.wallet.findFirst({
                        where: { user: { role: "SYSTEM" }, currency: "XOF" },
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
                                    fromCurrency: "XOF",
                                    toCurrency: "XOF",
                                    exchangeRate: 1.0,
                                    convertedAmount: BigInt(event.amount),
                                    status: "SUCCESS",
                                    reference: event.reference,
                                    note: "Dépôt confirmé via PayDunya",
                                },
                            });
                        });
                        console.log(`[WEBHOOK] PayDunya wallet crédité: ${event.amount} XOF pour user ${user.id}`);
                    }
                }
            }
        }
        return res.status(200).json({ received: true });
    }
    catch (error) {
        console.error("[WEBHOOK] PayDunya erreur:", error);
        return res.status(200).json({ received: true });
    }
});
exports.default = router;
//# sourceMappingURL=paydunya.routes.js.map