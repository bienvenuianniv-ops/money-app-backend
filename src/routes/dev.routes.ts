import { Router } from "express";
import { prisma } from "../db";
import bcrypt from "bcrypt";
import { z } from "zod";
import { auditLog } from "../utils/audit";

const router = Router();

const phoneSchema = z.object({
  phone: z.string().min(8),
});

const topupSchema = z.object({
  phone: z.string().min(8),
  amount: z.number().int().positive(),
});

/*
  POST /dev/bootstrap-system
  Crée l'utilisateur SYSTEM (une seule fois)
*/
router.post("/dev/bootstrap-system", async (req, res) => {
  try {
    const existing = await prisma.user.findFirst({
      where: { role: "SYSTEM" },
    });

    if (existing) {
  // Ensure SYSTEM wallet exists + has a healthy balance for dev tests
  const targetBalance = 10_000_000n; // 10M XOF
  const w = await prisma.wallet.findFirst({ where: { userId: existing.id, currency: "XOF" } });

  if (!w) {
    await prisma.wallet.create({
      data: {
        userId: existing.id,
        currency: "XOF",
        balance: targetBalance,
      },
    });
  } else if (w.balance < targetBalance) {
    await prisma.wallet.update({
      where: { id: w.id },
      data: { balance: targetBalance },
    });
  }

  await auditLog({
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

    const pinHash = await bcrypt.hash("0000", 10);

    const systemUser = await prisma.$transaction(async (tx) => {
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
    balance: 10_000_000n,
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

    await auditLog({
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
  } catch (e: any) {
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
    const systemUser = await prisma.user.findFirst({
      where: { role: "SYSTEM" },
    });

    if (!systemUser) {
      return res.status(404).json({
        ok: false,
        message: "SYSTEM introuvable",
      });
    }

    const wallet = await prisma.wallet.findFirst({
      where: { userId: systemUser.id },
      select: { id: true, balance: true, currency: true, updatedAt: true },
    });

    if (!wallet) {
      return res.status(404).json({
        ok: false,
        message: "Wallet SYSTEM introuvable",
      });
    }

    await auditLog({
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
  } catch (e: any) {
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

    const user = await prisma.user.findUnique({ where: { phone } });
    if (!user) {
      return res.status(404).json({ ok: false, message: "Utilisateur introuvable" });
    }

    if (user.role === "SYSTEM") {
      return res.status(400).json({ ok: false, message: "Impossible de suspendre SYSTEM" });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { status: "SUSPENDED" },
    });

    await auditLog({
      action: "USER_SUSPENDED",
      actorUserId: null,
      targetUserId: user.id,
      ip: req.ip,
      userAgent: req.headers["user-agent"] ?? null,
      metadata: { phone },
    });

    return res.json({ ok: true, message: "Utilisateur suspendu" });
  } catch (e: any) {
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

    const user = await prisma.user.findUnique({ where: { phone } });
    if (!user) {
      return res.status(404).json({ ok: false, message: "Utilisateur introuvable" });
    }

    if (user.role === "SYSTEM") {
      return res.status(400).json({ ok: false, message: "Impossible de réactiver SYSTEM" });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { status: "ACTIVE" },
    });

    await auditLog({
      action: "USER_UNSUSPENDED",
      actorUserId: null,
      targetUserId: user.id,
      ip: req.ip,
      userAgent: req.headers["user-agent"] ?? null,
      metadata: { phone },
    });

    return res.json({ ok: true, message: "Utilisateur réactivé" });
  } catch (e: any) {
    return res.status(400).json({ ok: false, message: e?.message ?? "Erreur" });
  }
});

/*
  GET /dev/audit
  Voir les 50 derniers logs
*/
router.get("/dev/audit", async (_req, res) => {
  const logs = await prisma.auditLog.findMany({
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

    const user = await prisma.user.findUnique({ where: { phone } });
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
    const existingWallet = await prisma.wallet.findFirst({
      where: { userId: user.id },
    });

    let wallet;
    if (existingWallet) {
      wallet = await prisma.wallet.update({
        where: { id: existingWallet.id },
        data: { balance: { increment: BigInt(amount) } },
      });
    } else {
      wallet = await prisma.wallet.create({
        data: { userId: user.id, balance: BigInt(amount), currency: "XOF" },
      });
    }

    await auditLog({
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
  } catch (e: any) {
    const msg = e?.message ?? "Erreur";
    return res.status(400).json({ ok: false, message: msg });
  }
});

export default router;


