import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../db";

export type AuthedRequest = Request & {
  user?: { id: string; status?: string; role?: string };
};

export async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ ok: false, message: "Token manquant" });
  }

  const token = header.slice("Bearer ".length);
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    return res.status(500).json({ ok: false, message: "JWT_SECRET manquant" });
  }

  try {
    const payload = jwt.verify(token, secret) as { sub?: string };
    const userId = payload.sub;

    if (!userId) {
      return res.status(401).json({ ok: false, message: "Token invalide" });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, status: true, role: true },
    });

    if (!user) {
      return res.status(401).json({ ok: false, message: "Utilisateur introuvable" });
    }

    if (user.status === "SUSPENDED") {
      return res.status(403).json({ ok: false, message: "Compte suspendu" });
    }

    // ✅ Standard unique dans tout le projet
    req.user = { id: user.id, status: user.status, role: user.role };

    return next();
  } catch {
    return res.status(401).json({ ok: false, message: "Token invalide" });
  }
}