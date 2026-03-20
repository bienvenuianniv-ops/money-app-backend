"use strict";
// src/routes/auth.routes.ts
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const auth_service_1 = require("../services/auth.service");
const router = (0, express_1.Router)();
const handleError = (error, res, next) => {
    if (error instanceof auth_service_1.AuthError) {
        return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    return next(error);
};
const getHeaders = (req) => ({
    ip: req.ip ?? null,
    userAgent: req.get("user-agent") ?? null,
    requestId: typeof req.headers["x-request-id"] === "string" ? req.headers["x-request-id"] : null,
    correlationId: typeof req.headers["x-correlation-id"] === "string" ? req.headers["x-correlation-id"] : null,
});
// ─────────────────────────────────────────────
// ENDPOINTS PUBLICS
// ─────────────────────────────────────────────
/**
 * GET /api/auth/countries
 * Liste des pays supportés par la plateforme
 */
router.get("/countries", (req, res) => {
    const countries = auth_service_1.AuthService.getSupportedCountries();
    return res.status(200).json({ success: true, data: countries });
});
/**
 * POST /api/auth/register
 * Inscription d'un nouvel utilisateur
 *
 * Body: { phone, pin, countryCode? }
 * countryCode : ISO 3166-1 alpha-2 (ex: "SN", "FR", "CM"), défaut "SN"
 */
router.post("/register", async (req, res, next) => {
    try {
        const { phone, pin, countryCode } = req.body;
        const result = await auth_service_1.AuthService.register({
            phone,
            pin,
            countryCode,
            ...getHeaders(req),
        });
        return res.status(201).json({
            success: true,
            message: "Compte créé avec succès.",
            data: result,
        });
    }
    catch (error) {
        return handleError(error, res, next);
    }
});
/**
 * POST /api/auth/login
 * Connexion avec numéro de téléphone + PIN
 *
 * Body: { phone, pin }
 */
router.post("/login", async (req, res, next) => {
    try {
        const { phone, pin } = req.body;
        const result = await auth_service_1.AuthService.loginWithPin({
            phone,
            pin,
            ...getHeaders(req),
        });
        return res.status(200).json({
            success: true,
            message: "Connexion réussie.",
            data: result,
        });
    }
    catch (error) {
        return handleError(error, res, next);
    }
});
// ─────────────────────────────────────────────
// ENDPOINTS PROTÉGÉS
// ─────────────────────────────────────────────
/**
 * GET /api/auth/me
 * Profil de l'utilisateur connecté (avec wallets)
 */
router.get("/me", auth_1.requireAuth, async (req, res, next) => {
    try {
        const user = await auth_service_1.AuthService.getProfile(req.user.id);
        return res.status(200).json({ success: true, data: user });
    }
    catch (error) {
        return handleError(error, res, next);
    }
});
/**
 * PATCH /api/auth/unlock-pin/:userId
 * Déverrouillage manuel du PIN (admin seulement en production)
 */
router.patch("/unlock-pin/:userId", auth_1.requireAuth, async (req, res, next) => {
    try {
        const result = await auth_service_1.AuthService.unlockPinManually({
            userId: req.params.userId,
            ...getHeaders(req),
        });
        return res.status(200).json({
            success: true,
            message: result.message,
        });
    }
    catch (error) {
        return handleError(error, res, next);
    }
});
exports.default = router;
//# sourceMappingURL=auth.routes.js.map