import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../db";
 
type JwtPayloadWithSub = {
  sub?: string;
  userId?: string;
};
 
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({
      ok: false,
      message: "Token manquant ou mal forme",
    });
  }
 
  const token = header.slice("Bearer ".length).trim();
  const secret = process.env.JWT_SECRET;
 
  if (!secret) {
    return res.status(500).json({
      ok: false,
      message: "JWT_SECRET manquant",
    });
  }
 
  try {
    const decoded = jwt.verify(token, secret);
 
    if (
      typeof decoded !== "object" ||
      decoded === null ||
      (typeof (decoded as JwtPayloadWithSub).sub !== "string" &&
        typeof (decoded as JwtPayloadWithSub).userId !== "string")
    ) {
      return res.status(401).json({
        ok: false,
        message: "Token invalide",
      });
    }
 
    const userId = (decoded as JwtPayloadWithSub).userId || (decoded as JwtPayloadWithSub).sub;
 
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        status: true,
        role: true,
      },
    });
 
    if (!user) {
      return res.status(401).json({
        ok: false,
        message: "Utilisateur introuvable",
      });
    }
 
    if (user.status === "SUSPENDED") {
      return res.status(403).json({
        ok: false,
        message: "Compte suspendu",
      });
    }
 
    req.user = {
      id: user.id,
      status: user.status,
      role: user.role,
    };
 
    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      return res.status(401).json({
        ok: false,
        message: "Token expire",
      });
    }
    if (error instanceof jwt.JsonWebTokenError) {
      return res.status(401).json({
        ok: false,
        message: "Token invalide",
      });
    }
    return res.status(500).json({
      ok: false,
      message: "Erreur serveur",
    });
  }
}