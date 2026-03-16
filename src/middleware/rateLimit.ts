import rateLimit from "express-rate-limit";

/**
 * Limite globale pour toute l'API
 * 300 requêtes / 15 minutes / IP
 */
export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    ok: false,
    message: "Trop de requêtes. Réessaie plus tard.",
  },
});

/**
 * Limite pour l'inscription
 * 10 requêtes / 15 minutes / IP
 */
export const authRegisterLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    ok: false,
    message: "Trop de tentatives d'inscription. Réessaie plus tard.",
  },
});

/**
 * Limite stricte pour le login
 * 5 tentatives / 15 minutes / IP
 */
export const authLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    ok: false,
    message: "Trop de tentatives de connexion. Réessaie plus tard.",
  },
});

/**
 * Limite pour les opérations financières sensibles
 * 10 requêtes / minute / IP
 */
export const transactionLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    ok: false,
    message: "Trop de requêtes sur cette opération. Réessaie plus tard.",
  },
});