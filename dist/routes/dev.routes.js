"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_1 = require("../db");
const bcrypt_1 = __importDefault(require("bcrypt"));
const zod_1 = require("zod");
const audit_1 = require("../utils/audit");
const router = (0, express_1.Router)();
const phoneSchema = zod_1.z.object({
    phone: zod_1.z.string().min(8),
});
const topupSchema = zod_1.z.object({
    phone: zod_1.z.string().min(8),
    amount: zod_1.z.number().int().positive(),
});
/*
  POST /dev/bootstrap-system
  Crée l'utilisateur SYSTEM (une seule fois)
*/
router.post("/dev/bootstrap-system", async (req, res) => {
    try {
        const existing = await db_1.prisma.user.findFirst({
            where: { role: "SYSTEM" },
        });
        if (existing) {
            // Ensure SYSTEM wallet exists + has a healthy balance for dev tests
            const targetBalance = 10000000n; // 10M XOF
            const w = await db_1.prisma.wallet.findFirst({ where: { userId: existing.id, currency: "XOF" } });
            if (!w) {
                await db_1.prisma.wallet.create({
                    data: {
                        userId: existing.id,
                        currency: "XOF",
                        balance: targetBalance,
                    },
                });
            }
            else if (w.balance < targetBalance) {
                await db_1.prisma.wallet.update({
                    where: { id: w.id },
                    data: { balance: targetBalance },
                });
            }
            await (0, audit_1.auditLog)({
                action: "SYSTEM_BOOTSTRAP_ALREADY_EXISTS",
                actorUserId: null,
                targetUserId: existing.id,
                ip: req.ip,
                userAgent: req.headers["user-agent"] ?? null,
            });
            return res.json({
                ok: true,
                message: "SYSTEM déjà existant",
                userId: existing.id,
            });
        }
        const pinHash = await bcrypt_1.default.hash("0000", 10);
        const systemUser = await db_1.prisma.$transaction(async (tx) => {
            const u = await tx.user.create({
                data: {
                    phone: "SYSTEM_ACCOUNT",
                    pinHash,
                    role: "SYSTEM",
                    status: "ACTIVE",
                },
            });
            await tx.wallet.create({
                data: {
                    userId: u.id,
                    currency: "XOF",
                    balance: 10000000n,
                },
            });
            await tx.wallet.create({
                data: {
                    userId: u.id,
                    currency: "XOF",
                    balance: BigInt(0),
                },
            });
            return u;
        });
        await (0, audit_1.auditLog)({
            action: "SYSTEM_BOOTSTRAPPED",
            actorUserId: null,
            targetUserId: systemUser.id,
            ip: req.ip,
            userAgent: req.headers["user-agent"] ?? null,
        });
        return res.json({
            ok: true,
            message: "SYSTEM créé",
            userId: systemUser.id,
        });
    }
    catch (e) {
        return res.status(500).json({
            ok: false,
            message: e?.message ?? "Erreur",
        });
    }
});
/*
  GET /dev/system-wallet
  Voir le wallet SYSTEM
*/
router.get("/dev/system-wallet", async (req, res) => {
    try {
        const systemUser = await db_1.prisma.user.findFirst({
            where: { role: "SYSTEM" },
        });
        if (!systemUser) {
            return res.status(404).json({
                ok: false,
                message: "SYSTEM introuvable",
            });
        }
        const wallet = await db_1.prisma.wallet.findFirst({
            where: { userId: systemUser.id },
            select: { id: true, balance: true, currency: true, updatedAt: true },
        });
        if (!wallet) {
            return res.status(404).json({
                ok: false,
                message: "Wallet SYSTEM introuvable",
            });
        }
        await (0, audit_1.auditLog)({
            action: "SYSTEM_WALLET_VIEWED",
            actorUserId: null,
            targetUserId: systemUser.id,
            ip: req.ip,
            userAgent: req.headers["user-agent"] ?? null,
        });
        return res.json({
            ok: true,
            systemUserId: systemUser.id,
            wallet: { ...wallet, balance: wallet.balance.toString() },
        });
    }
    catch (e) {
        return res.status(500).json({
            ok: false,
            message: e?.message ?? "Erreur",
        });
    }
});
/*
  POST /dev/suspend-user
  Body: { "phone": "780000000" }
*/
router.post("/dev/suspend-user", async (req, res) => {
    try {
        const { phone } = phoneSchema.parse(req.body);
        const user = await db_1.prisma.user.findUnique({ where: { phone } });
        if (!user) {
            return res.status(404).json({ ok: false, message: "Utilisateur introuvable" });
        }
        if (user.role === "SYSTEM") {
            return res.status(400).json({ ok: false, message: "Impossible de suspendre SYSTEM" });
        }
        await db_1.prisma.user.update({
            where: { id: user.id },
            data: { status: "SUSPENDED" },
        });
        await (0, audit_1.auditLog)({
            action: "USER_SUSPENDED",
            actorUserId: null,
            targetUserId: user.id,
            ip: req.ip,
            userAgent: req.headers["user-agent"] ?? null,
            metadata: { phone },
        });
        return res.json({ ok: true, message: "Utilisateur suspendu" });
    }
    catch (e) {
        return res.status(400).json({ ok: false, message: e?.message ?? "Erreur" });
    }
});
/*
  POST /dev/unsuspend-user
  Body: { "phone": "780000000" }
*/
router.post("/dev/unsuspend-user", async (req, res) => {
    try {
        const { phone } = phoneSchema.parse(req.body);
        const user = await db_1.prisma.user.findUnique({ where: { phone } });
        if (!user) {
            return res.status(404).json({ ok: false, message: "Utilisateur introuvable" });
        }
        if (user.role === "SYSTEM") {
            return res.status(400).json({ ok: false, message: "Impossible de réactiver SYSTEM" });
        }
        await db_1.prisma.user.update({
            where: { id: user.id },
            data: { status: "ACTIVE" },
        });
        await (0, audit_1.auditLog)({
            action: "USER_UNSUSPENDED",
            actorUserId: null,
            targetUserId: user.id,
            ip: req.ip,
            userAgent: req.headers["user-agent"] ?? null,
            metadata: { phone },
        });
        return res.json({ ok: true, message: "Utilisateur réactivé" });
    }
    catch (e) {
        return res.status(400).json({ ok: false, message: e?.message ?? "Erreur" });
    }
});
/*
  GET /dev/audit
  Voir les 50 derniers logs
*/
router.get("/dev/audit", async (_req, res) => {
    const logs = await db_1.prisma.auditLog.findMany({
        orderBy: { createdAt: "desc" },
        take: 50,
    });
    // metadata est Json? dans Prisma => pas de JSON.parse
    return res.json({
        ok: true,
        logs,
    });
});
/*
  POST /dev/topup
  DEV: créditer le wallet d'un user par phone
  Body: { "phone": "770000000", "amount": 20000 }
*/
router.post("/dev/topup", async (req, res) => {
    try {
        const { phone, amount } = topupSchema.parse(req.body);
        const user = await db_1.prisma.user.findUnique({ where: { phone } });
        if (!user) {
            return res.status(404).json({ ok: false, message: "User introuvable" });
        }
        if (user.role === "SYSTEM") {
            return res.status(400).json({
                ok: false,
                message: "Utilise /dev/bootstrap-system, pas topup sur SYSTEM",
            });
        }
        // userId n'est pas @unique dans Wallet => pas de upsert sur userId.
        const existingWallet = await db_1.prisma.wallet.findFirst({
            where: { userId: user.id },
        });
        let wallet;
        if (existingWallet) {
            wallet = await db_1.prisma.wallet.update({
                where: { id: existingWallet.id },
                data: { balance: { increment: BigInt(amount) } },
            });
        }
        else {
            wallet = await db_1.prisma.wallet.create({
                data: { userId: user.id, balance: BigInt(amount), currency: "XOF" },
            });
        }
        await (0, audit_1.auditLog)({
            action: "DEV_TOPUP",
            actorUserId: null,
            targetUserId: user.id,
            ip: req.ip,
            userAgent: req.headers["user-agent"] ?? null,
            metadata: { phone, amount },
        });
        return res.json({
            ok: true,
            message: "Topup OK",
            userId: user.id,
            wallet: { ...wallet, balance: wallet.balance.toString() },
        });
    }
    catch (e) {
        const msg = e?.message ?? "Erreur";
        return res.status(400).json({ ok: false, message: msg });
    }
});
exports.default = router;
//# sourceMappingURL=dev.routes.js.map