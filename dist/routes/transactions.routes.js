"use strict";
// src/routes/transactions.routes.ts
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const transactions_service_1 = require("../services/transactions.service");
const exchange_service_1 = require("../services/exchange.service");
const router = (0, express_1.Router)();
// Helper : gestion des erreurs uniformisée
const handleError = (error, res, next) => {
    if (error instanceof transactions_service_1.TransactionError) {
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
router.get("/wallets", auth_1.requireAuth, async (req, res, next) => {
    try {
        const wallets = await transactions_service_1.TransactionsService.getMyWallets(req.user.id);
        return res.status(200).json({ success: true, data: wallets });
    }
    catch (error) {
        return handleError(error, res, next);
    }
});
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
router.post("/transactions/transfer", auth_1.requireAuth, async (req, res, next) => {
    try {
        const { recipientPhone, amount, currency, note } = req.body;
        const idempotencyKey = req.headers["x-idempotency-key"];
        const result = await transactions_service_1.TransactionsService.transfer({
            senderUserId: req.user.id,
            recipientPhone,
            amount,
            currency,
            note,
            idempotencyKey,
            ip: req.ip ?? null,
            userAgent: req.get("user-agent") ?? null,
            requestId: req.headers["x-request-id"] ?? null,
            correlationId: req.headers["x-correlation-id"] ?? null,
        });
        return res.status(200).json({ success: true, data: result });
    }
    catch (error) {
        return handleError(error, res, next);
    }
});
/**
 * POST /api/transactions/deposit
 * Dépôt sur un wallet (réservé aux admins/système en production)
 *
 * Body: { amount, currency, note? }
 */
router.post("/transactions/deposit", auth_1.requireAuth, async (req, res, next) => {
    try {
        const { amount, currency, note } = req.body;
        const result = await transactions_service_1.TransactionsService.deposit({
            userId: req.user.id,
            amount,
            currency,
            note,
            requestId: req.headers["x-request-id"] ?? null,
        });
        return res.status(200).json({ success: true, data: result });
    }
    catch (error) {
        return handleError(error, res, next);
    }
});
/**
 * POST /api/transactions/withdraw
 * Retrait depuis un wallet
 *
 * Body: { amount, currency, note? }
 * Header: x-idempotency-key
 */
router.post("/transactions/withdraw", auth_1.requireAuth, async (req, res, next) => {
    try {
        const { amount, currency, note } = req.body;
        const idempotencyKey = req.headers["x-idempotency-key"];
        const result = await transactions_service_1.TransactionsService.withdraw({
            userId: req.user.id,
            amount,
            currency,
            idempotencyKey,
            note,
            ip: req.ip ?? null,
            userAgent: req.get("user-agent") ?? null,
            requestId: req.headers["x-request-id"] ?? null,
            correlationId: req.headers["x-correlation-id"] ?? null,
        });
        return res.status(200).json({ success: true, data: result });
    }
    catch (error) {
        return handleError(error, res, next);
    }
});
/**
 * GET /api/transactions
 * Historique des transactions avec pagination et filtres
 *
 * Query: ?page=1&limit=20&currency=XOF&type=TRANSFER
 */
router.get("/transactions", auth_1.requireAuth, async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = Math.min(parseInt(req.query.limit) || 20, 100);
        const currency = req.query.currency;
        const type = req.query.type;
        const result = await transactions_service_1.TransactionsService.getMyTransactions(req.user.id, {
            page,
            limit,
            currency,
            type,
        });
        return res.status(200).json({ success: true, data: result });
    }
    catch (error) {
        return handleError(error, res, next);
    }
});
// ─────────────────────────────────────────────
// TAUX DE CHANGE
// ─────────────────────────────────────────────
/**
 * GET /api/exchange/rates
 * Retourne tous les taux de change actifs
 */
router.get("/exchange/rates", auth_1.requireAuth, async (req, res, next) => {
    try {
        const rates = await exchange_service_1.ExchangeService.getAllRates();
        return res.status(200).json({ success: true, data: rates });
    }
    catch (error) {
        return next(error);
    }
});
/**
 * GET /api/exchange/convert?from=XOF&to=EUR&amount=10000
 * Simule une conversion sans effectuer de transaction
 */
router.get("/exchange/convert", auth_1.requireAuth, async (req, res, next) => {
    try {
        const { from, to, amount } = req.query;
        if (!from || !to || !amount) {
            return res.status(400).json({
                success: false,
                message: "Paramètres requis : from, to, amount",
            });
        }
        const amountNum = parseInt(amount);
        if (isNaN(amountNum) || amountNum <= 0) {
            return res.status(400).json({ success: false, message: "Montant invalide." });
        }
        const { convertedAmount, rate } = await exchange_service_1.ExchangeService.convert(BigInt(amountNum), from, to);
        const fee = exchange_service_1.ExchangeService.calculateFee(BigInt(amountNum), from, to);
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
    }
    catch (error) {
        return next(error);
    }
});
exports.default = router;
//# sourceMappingURL=transactions.routes.js.map