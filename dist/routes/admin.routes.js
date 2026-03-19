"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// src/routes/admin.routes.ts
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const db_1 = require("../db");
const library_1 = require("@prisma/client/runtime/library");
const fedapay_service_1 = require("../services/payment-providers/fedapay.service");
const router = (0, express_1.Router)();
// Middleware admin
const requireAdmin = async (req, res, next) => {
    const user = await db_1.prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user || user.role !== "ADMIN") {
        return res.status(403).json({ success: false, message: "Accès admin requis." });
    }
    return next();
};
// ── GET /api/admin/fees ─────────────────────────
router.get("/admin/fees", auth_1.requireAuth, requireAdmin, async (req, res, next) => {
    try {
        const systemWallets = await db_1.prisma.wallet.findMany({
            where: { user: { role: "SYSTEM" } },
            include: { user: { select: { phone: true, role: true } } },
        });
        const totalFees = await db_1.prisma.transaction.aggregate({
            _sum: { fee: true },
            where: { status: "SUCCESS" },
        });
        return res.json({
            success: true,
            data: {
                systemWallets: systemWallets.map(w => ({
                    currency: w.currency,
                    balance: w.balance.toString(),
                })),
                totalFeesCollected: totalFees._sum.fee?.toString() || "0",
            },
        });
    }
    catch (error) {
        return next(error);
    }
});
// ── GET /api/admin/stats ────────────────────────
router.get("/admin/stats", auth_1.requireAuth, requireAdmin, async (req, res, next) => {
    try {
        const totalUsers = await db_1.prisma.user.count({ where: { role: "USER" } });
        const totalTransactions = await db_1.prisma.transaction.count({ where: { status: "SUCCESS" } });
        const totalVolume = await db_1.prisma.transaction.aggregate({
            _sum: { amount: true },
            where: { status: "SUCCESS", type: "TRANSFER" },
        });
        return res.json({
            success: true,
            data: {
                totalUsers,
                totalTransactions,
                totalVolume: totalVolume._sum.amount?.toString() || "0",
            },
        });
    }
    catch (error) {
        return next(error);
    }
});
// ── POST /api/admin/withdraw-fees ───────────────
// Retirer les frais collectés du wallet SYSTEM vers Mobile Money via FedaPay
router.post("/admin/withdraw-fees", auth_1.requireAuth, requireAdmin, async (req, res, next) => {
    try {
        const { amount, currency = "XOF", phoneNumber, firstName = "Admin", lastName = "PayWest", email = "admin@paywest.com", } = req.body;
        // 1. Validation
        if (!amount || !phoneNumber) {
            return res.status(400).json({
                success: false,
                message: "Les champs 'amount' et 'phoneNumber' sont requis.",
            });
        }
        const withdrawAmount = new library_1.Decimal(String(amount).trim());
        if (withdrawAmount.lte(0)) {
            return res.status(400).json({
                success: false,
                message: "Le montant doit être supérieur à 0.",
            });
        }
        // 2. Trouver le wallet SYSTEM
        const systemWallet = await db_1.prisma.wallet.findFirst({
            where: {
                currency,
                user: { role: "SYSTEM" },
            },
        });
        if (!systemWallet) {
            return res.status(404).json({
                success: false,
                message: `Wallet SYSTEM introuvable pour la devise ${currency}.`,
            });
        }
        // 3. Vérifier le solde
        if (new library_1.Decimal(systemWallet.balance.toString()).lt(withdrawAmount)) {
            return res.status(400).json({
                success: false,
                message: "Solde insuffisant dans le wallet SYSTEM.",
                available: systemWallet.balance.toString(),
            });
        }
        // 4. Générer une référence unique
        const reference = `ADMIN-WITHDRAW-${Date.now()}`;
        // 5. Appel FedaPay (payout vers Mobile Money)
        const fedaResult = await fedapay_service_1.fedapay.initiateWithdraw({
            amount: withdrawAmount.toNumber(),
            currency,
            phone: phoneNumber,
            firstName,
            lastName,
            email,
            reference,
        });
        // 6. Si FedaPay échoue → on n'écrit rien en base
        if (!fedaResult.success) {
            return res.status(502).json({
                success: false,
                message: `FedaPay a refusé le retrait : ${fedaResult.message}`,
                raw: fedaResult.raw,
            });
        }
        // 7. FedaPay OK → déduire du wallet SYSTEM + enregistrer la transaction (atomique)
        const [updatedWallet, transaction] = await db_1.prisma.$transaction([
            db_1.prisma.wallet.update({
                where: { id: systemWallet.id },
                data: { balance: { decrement: BigInt(withdrawAmount.toFixed(0)) } },
            }),
            db_1.prisma.transaction.create({
                data: {
                    type: "WITHDRAW",
                    status: "SUCCESS",
                    amount: BigInt(withdrawAmount.toFixed(0)),
                    fee: BigInt(0),
                    fromCurrency: currency,
                    toCurrency: currency,
                    exchangeRate: 1.0,
                    convertedAmount: BigInt(withdrawAmount.toFixed(0)),
                    fromWalletId: systemWallet.id,
                    toWalletId: systemWallet.id,
                    description: `Retrait frais admin vers ${phoneNumber} — réf: ${reference}`,
                },
            }),
        ]);
        return res.json({
            success: true,
            message: `Retrait de ${withdrawAmount.toString()} ${currency} effectué avec succès.`,
            data: {
                transactionId: transaction.id,
                reference,
                amount: withdrawAmount.toString(),
                currency,
                destination: phoneNumber,
                newSystemBalance: updatedWallet.balance.toString(),
                status: transaction.status,
                fedapayRef: fedaResult.reference,
                fedapayRaw: fedaResult.raw,
            },
        });
    }
    catch (error) {
        return next(error);
    }
});
exports.default = router;
//# sourceMappingURL=admin.routes.js.map