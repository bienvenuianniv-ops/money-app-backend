"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.transactionLimiter = exports.authLoginLimiter = exports.authRegisterLimiter = exports.globalLimiter = void 0;
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
/**
 * Limite globale pour toute l'API
 * 300 requêtes / 15 minutes / IP
 */
exports.globalLimiter = (0, express_rate_limit_1.default)({
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
exports.authRegisterLimiter = (0, express_rate_limit_1.default)({
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
exports.authLoginLimiter = (0, express_rate_limit_1.default)({
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
exports.transactionLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        ok: false,
        message: "Trop de requêtes sur cette opération. Réessaie plus tard.",
    },
});
//# sourceMappingURL=rateLimit.js.map