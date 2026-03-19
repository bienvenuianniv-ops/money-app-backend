// src/routes/admin.routes.ts
import { Router, Request, Response, NextFunction } from "express";
import { requireAuth } from "../middleware/auth";
import { prisma } from "../db";
import { Decimal } from "@prisma/client/runtime/library";
import { fedapay } from "../services/payment-providers/fedapay.service";

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

// ── POST /api/admin/withdraw-fees ───────────────
// Retirer les frais collectés du wallet SYSTEM vers Mobile Money via FedaPay
router.post("/admin/withdraw-fees", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const {
      amount,
      currency = "XOF",
      phoneNumber,
      firstName = "Admin",
      lastName = "PayWest",
      email = "admin@paywest.com",
    } = req.body;

    // 1. Validation
    if (!amount || !phoneNumber) {
      return res.status(400).json({
        success: false,
        message: "Les champs 'amount' et 'phoneNumber' sont requis.",
      });
    }

   const withdrawAmount = new Decimal(String(amount).trim());
if (withdrawAmount.lte(0)) {
  return res.status(400).json({
    success: false,
    message: "Le montant doit être supérieur à 0.",
  });
}

    // 2. Trouver le wallet SYSTEM
    const systemWallet = await prisma.wallet.findFirst({
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
    if (new Decimal(systemWallet.balance).lt(withdrawAmount)) {
      return res.status(400).json({
        success: false,
        message: "Solde insuffisant dans le wallet SYSTEM.",
        available: systemWallet.balance.toString(),
      });
    }

    // 4. Générer une référence unique
    const reference = `ADMIN-WITHDRAW-${Date.now()}`;

    // 5. Appel FedaPay (payout vers Mobile Money)
    const fedaResult = await fedapay.initiateWithdraw({
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
    const [updatedWallet, transaction] = await prisma.$transaction([
      prisma.wallet.update({
        where: { id: systemWallet.id },
        data: { balance: { decrement: withdrawAmount } },
      }),
      prisma.transaction.create({
        data: {
          type: "WITHDRAW",
          status: "SUCCESS",
          amount: withdrawAmount,
          fee: new Decimal(0),
          currency,
          senderId: systemWallet.userId,
          receiverId: systemWallet.userId,
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
  } catch (error) {
    return next(error);
  }
});

export default router;