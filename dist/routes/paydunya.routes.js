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
router.post("/paydunya/deposit", auth_1.requireAuth, async (req, res, next) => {
    try {
        const { amount, currency, description, customerName } = req.body;
        if (!amount || !currency) {
            return res.status(400).json({ success: false, message: "amount et currency sont requis." });
        }
        if (!Number.isInteger(amount) || amount <= 0) {
            return res.status(400).json({ success: false, message: "Le montant doit être un entier positif." });
        }
        const user = await db_1.prisma.user.findUnique({
            where: { id: req.user.id },
            select: { id: true, phone: true },
        });
        const name = customerName || (user?.phone ? `Client ${user.phone}` : "Client PayWest");
        const reference = `DEP-PD-${req.user.id.slice(0, 8)}-${Date.now()}`;
        const result = await paydunya_service_1.paydunya.initiateDeposit({
            amount, currency,
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
        return res.status(502).json({ success: false, message: `Erreur PayDunya: ${error.message}` });
    }
});
// ─────────────────────────────────────────────────────────────
// VÉRIFICATION DU STATUT
// ─────────────────────────────────────────────────────────────
router.get("/paydunya/status/:token", auth_1.requireAuth, async (req, res) => {
    try {
        const result = await paydunya_service_1.paydunya.checkPaymentStatus(req.params.token);
        return res.status(200).json({ success: true, data: result });
    }
    catch (error) {
        return res.status(502).json({ success: false, message: `Erreur PayDunya: ${error.message}` });
    }
});
// ─────────────────────────────────────────────────────────────
// WEBHOOK IPN
// ─────────────────────────────────────────────────────────────
router.post("/webhooks/paydunya", async (req, res) => {
    try {
        // Logger tout pour diagnostic
        console.log("[WEBHOOK] PayDunya body:", JSON.stringify(req.body));
        console.log("[WEBHOOK] PayDunya query:", JSON.stringify(req.query));
        console.log("[WEBHOOK] PayDunya headers:", JSON.stringify(req.headers));
        // PayDunya peut envoyer le token via query string
        const token = req.query.token || req.body?.data?.invoice?.token || req.body?.token;
        console.log("[WEBHOOK] PayDunya token reçu:", token);
        if (!token) {
            console.log("[WEBHOOK] PayDunya: pas de token, on ignore");
            return res.status(200).json({ received: true });
        }
        // Vérifier le statut via l'API PayDunya
        const statusResult = await paydunya_service_1.paydunya.checkPaymentStatus(token);
        console.log("[WEBHOOK] PayDunya statut:", JSON.stringify(statusResult));
        if (statusResult.status === "complete" || statusResult.status === "completed") {
            // Extraire la référence depuis le raw
            const reference = statusResult.raw?.custom_data?.reference || "";
            console.log("[WEBHOOK] PayDunya référence:", reference);
            if (reference) {
                const parts = reference.split("-");
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
                                    data: { balance: { increment: BigInt(statusResult.amount) } },
                                });
                                await tx.transaction.create({
                                    data: {
                                        type: "DEPOSIT",
                                        fromWalletId: systemWallet.id,
                                        toWalletId: wallet.id,
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
    }
    catch (error) {
        console.error("[WEBHOOK] PayDunya erreur:", error);
        return res.status(200).json({ received: true });
    }
});
// ─────────────────────────────────────────────────────────────
// RETRAIT avec vrai déboursement PayDunya
// ─────────────────────────────────────────────────────────────
/**
 * POST /api/paydunya/withdraw
 * Body: { amount, currency, phone, operator, name }
 */
router.post("/paydunya/withdraw", auth_1.requireAuth, async (req, res) => {
    try {
        const { amount, currency, phone, operator, name } = req.body;
        if (!amount || !phone || !operator) {
            return res.status(400).json({
                success: false,
                message: "amount, phone et operator sont requis.",
            });
        }
        const user = await db_1.prisma.user.findUnique({
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
        const fee = Math.round(amount * 0.01);
        const totalDeducted = amount + fee;
        if (wallet.balance < BigInt(totalDeducted)) {
            return res.status(400).json({ success: false, message: "Solde insuffisant pour couvrir les frais." });
        }
        const reference = `WD-PD-${req.user.id.slice(0, 8)}-${Date.now()}`;
        // Déduire le solde du wallet PayWest
        await db_1.prisma.wallet.update({
            where: { id: wallet.id },
            data: { balance: { decrement: BigInt(totalDeducted) } },
        });
        // Enregistrer la transaction
        const systemWallet = await db_1.prisma.wallet.findFirst({
            where: { user: { role: "SYSTEM" }, currency: currency || "XOF" },
        });
        if (systemWallet) {
            await db_1.prisma.transaction.create({
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
                    note: `Retrait vers ${phone} via ${operator}`,
                },
            });
        }
        // Envoyer l'argent via PayDunya déboursement
        try {
            const disbResult = await paydunya_service_1.paydunya.sendMoney({
                amount,
                phone,
                operator,
                name: name || `Client ${user.phone}`,
                reference,
                note: `Retrait PayWest ${amount} XOF`,
            });
            console.log("[WITHDRAW] PayDunya déboursement:", JSON.stringify(disbResult));
        }
        catch (disbErr) {
            console.error("[WITHDRAW] Erreur déboursement PayDunya:", disbErr.message);
            // Le solde a déjà été débité — on note l'erreur mais on continue
        }
        await audit_service_1.AuditService.log({
            action: "PAYDUNYA_WITHDRAW_INITIATED",
            actorUserId: req.user.id,
            severity: "INFO",
            ip: req.ip ?? null,
            metadata: { amount, currency, reference, phone, operator },
        });
        return res.status(200).json({
            success: true,
            data: {
                reference,
                amount,
                fee,
                phone,
                operator,
                message: `Retrait de ${amount} XOF initié vers ${phone}. Vous recevrez l'argent sous peu.`,
            },
        });
    }
    catch (error) {
        return res.status(502).json({ success: false, message: `Erreur retrait: ${error.message}` });
    }
});
exports.default = router;
//# sourceMappingURL=paydunya.routes.js.map