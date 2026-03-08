import rateLimit from "express-rate-limit";

/**
 * Limite globale pour toute l'API
 * - 300 requêtes / 15 minutes / IP
 */
export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    ok: false,
    message: "Trop de requêtes. Réessaie plus tard.",
  },
});

/**
 * Limite spécifique pour le login
 * - 20 tentatives / 15 minutes / IP
 */
export const authLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    ok: false,
    message: "Trop de tentatives de connexion. Réessaie plus tard.",
  },
});