"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAuth = requireAuth;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const db_1 = require("../db");
async function requireAuth(req, res, next) {
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
        const decoded = jsonwebtoken_1.default.verify(token, secret);
        if (typeof decoded !== "object" ||
            decoded === null ||
            (typeof decoded.sub !== "string" &&
                typeof decoded.userId !== "string")) {
            return res.status(401).json({
                ok: false,
                message: "Token invalide",
            });
        }
        const userId = decoded.userId || decoded.sub;
        const user = await db_1.prisma.user.findUnique({
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
    }
    catch (error) {
        if (error instanceof jsonwebtoken_1.default.TokenExpiredError) {
            return res.status(401).json({
                ok: false,
                message: "Token expire",
            });
        }
        if (error instanceof jsonwebtoken_1.default.JsonWebTokenError) {
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
//# sourceMappingURL=auth.js.map