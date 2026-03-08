import { Router } from "express";
import { prisma } from "../db";
import { requireAuth } from "../middleware/auth";

const router = Router();

// GET /me
router.get("/me", requireAuth, async (req, res) => {
  const userId = (req as any).user.id as string;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, phone: true, createdAt: true },
  });

  if (!user) {
    return res.status(404).json({ ok: false, message: "Utilisateur introuvable" });
  }

  res.json({ ok: true, user });
});

// GET /wallet
router.get("/wallet", requireAuth, async (req, res) => {
  const userId = (req as any).user.id as string;

  const wallet = await prisma.wallet.findFirst({
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

export default router;
