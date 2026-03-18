// src/routes/admin.routes.ts
import { Router, Request, Response, NextFunction } from "express";
import { requireAuth } from "../middleware/auth";
import { prisma } from "../db";

const router = Router();

// Middleware admin
const requireAdmin = async (req: Request, res: Response, next: NextFunction) => {
  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!user || user.role !== "ADMIN") {
    return res.status(403).json({ success: false, message: "Accès admin requis." });
  }
  return next();
};

// ── GET /api/admin/fees ─────────────────────────
// Voir le solde des frais collectés dans le wallet SYSTEM
router.get("/admin/fees", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const systemWallets = await prisma.wallet.findMany({
      where: { user: { role: "SYSTEM" } },
      include: { user: { select: { phone: true, role: true } } },
    });

    const totalFees = await prisma.transaction.aggregate({
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
  } catch (error) {
    return next(error);
  }
});

// ── GET /api/admin/stats ────────────────────────
// Statistiques générales
router.get("/admin/stats", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const totalUsers = await prisma.user.count({ where: { role: "USER" } });
    const totalTransactions = await prisma.transaction.count({ where: { status: "SUCCESS" } });
    const totalVolume = await prisma.transaction.aggregate({
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
  } catch (error) {
    return next(error);
  }
});

export default router;