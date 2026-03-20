"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_1 = require("../db");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
// GET /me
router.get("/me", auth_1.requireAuth, async (req, res) => {
    const userId = req.user.id;
    const user = await db_1.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, phone: true, createdAt: true },
    });
    if (!user) {
        return res.status(404).json({ ok: false, message: "Utilisateur introuvable" });
    }
    res.json({ ok: true, user });
});
// GET /wallet
router.get("/wallet", auth_1.requireAuth, async (req, res) => {
    const userId = req.user.id;
    const wallet = await db_1.prisma.wallet.findFirst({
        where: { userId },
        select: { id: true, currency: true, balance: true, updatedAt: true },
    });
    if (!wallet) {
        return res.status(404).json({ ok: false, message: "Wallet introuvable" });
    }
    res.json({
        ok: true,
        wallet: { ...wallet, balance: wallet.balance.toString() },
    });
});
exports.default = router;
//# sourceMappingURL=wallet.routes.js.map