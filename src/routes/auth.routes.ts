import { Router } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { prisma } from "../db";
import { requireAuth } from "../middleware/auth";
import { authLoginLimiter } from "../middleware/rateLimit";

const router = Router();

// ---------------- REGISTER ----------------
const registerSchema = z.object({
  phone: z.string().min(8),
  pin: z.string().regex(/^\d{4,8}$/, "PIN doit contenir 4 à 8 chiffres"),
});

router.post("/auth/register", async (req, res) => {
  try {
    const { phone, pin } = registerSchema.parse(req.body);

    const existing = await prisma.user.findUnique({ where: { phone } });
    if (existing) {
      return res.status(409).json({ ok: false, message: "Téléphone déjà utilisé" });
    }

    const pinHash = await bcrypt.hash(pin, 10);

    const user = await prisma.$transaction(async (tx) => {
      const u = await tx.user.create({ data: { phone, pinHash } });

      await tx.wallet.create({
        data: { userId: u.id, currency: "XOF", balance: BigInt(0) },
      });

      return u;
    });

    return res.status(201).json({ ok: true, userId: user.id });
  } catch (e: any) {
    return res.status(400).json({ ok: false, message: e?.message ?? "Erreur" });
  }
});

// ---------------- LOGIN ----------------
const loginSchema = z.object({
  phone: z.string().min(8),
  pin: z.string().regex(/^\d{4,8}$/, "PIN doit contenir 4 à 8 chiffres"),
});

router.post("/auth/login", authLoginLimiter, async (req, res) => {
  try {
    const { phone, pin } = loginSchema.parse(req.body);

    const user = await prisma.user.findUnique({
      where: { phone },
      select: {
        id: true,
        pinHash: true,
        status: true,
        failedPinAttempts: true,
        pinLockedUntil: true,
      },
    });

    if (!user) {
      return res.status(401).json({ ok: false, message: "Identifiants invalides" });
    }

    if (user.status === "SUSPENDED") {
      return res.status(403).json({ ok: false, message: "Compte suspendu" });
    }

    // 🔒 Lock temporaire
    if (user.pinLockedUntil && user.pinLockedUntil > new Date()) {
      return res.status(423).json({
        ok: false,
        message: "Compte temporairement verrouillé. Réessaie plus tard.",
        lockedUntil: user.pinLockedUntil,
      });
    }

    const ok = await bcrypt.compare(pin, user.pinHash);

    const MAX_ATTEMPTS = 5;
    const LOCK_MINUTES = 15;

    if (!ok) {
      const nextAttempts = (user.failedPinAttempts ?? 0) + 1;

      const lock =
        nextAttempts >= MAX_ATTEMPTS
          ? new Date(Date.now() + LOCK_MINUTES * 60 * 1000)
          : null;

      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedPinAttempts: nextAttempts,
          pinLockedUntil: lock,
        },
      });

      const statusCode = nextAttempts >= MAX_ATTEMPTS ? 423 : 401;

      return res.status(statusCode).json({
        ok: false,
        message:
          nextAttempts >= MAX_ATTEMPTS
            ? `Trop de tentatives. Compte verrouillé ${LOCK_MINUTES} minutes.`
            : "Identifiants invalides",
        attempts: nextAttempts,
        lockedUntil: lock,
      });
    }

    // ✅ Succès → reset sécurité
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedPinAttempts: 0,
        pinLockedUntil: null,
        lastLoginAt: new Date(),
      },
    });

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      return res.status(500).json({ ok: false, message: "JWT_SECRET manquant" });
    }

    const token = jwt.sign({ sub: user.id }, secret, { expiresIn: "7d" });
    return res.json({ ok: true, token });
  } catch (e: any) {
    return res.status(400).json({ ok: false, message: e?.message ?? "Erreur" });
  }
});

// ---------------- CHANGE PIN ----------------
router.post("/auth/change-pin", requireAuth, async (req, res) => {
  try {
    const schema = z.object({
      oldPin: z.string().regex(/^\d{4,8}$/, "Ancien PIN invalide"),
      newPin: z.string().regex(/^\d{4,8}$/, "Nouveau PIN invalide"),
    });

    const { oldPin, newPin } = schema.parse(req.body);
    const userId = (req as any).user.id as string;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, pinHash: true },
    });

    if (!user) {
      return res.status(404).json({ ok: false, message: "Utilisateur introuvable" });
    }

    const ok = await bcrypt.compare(oldPin, user.pinHash);
    if (!ok) {
      return res.status(401).json({ ok: false, message: "Ancien PIN incorrect" });
    }

    const newHash = await bcrypt.hash(newPin, 10);

    await prisma.user.update({
      where: { id: userId },
      data: { pinHash: newHash },
    });

    return res.json({ ok: true, message: "PIN mis à jour" });
  } catch (e: any) {
    return res.status(400).json({ ok: false, message: e?.message ?? "Erreur" });
  }
});

export default router;