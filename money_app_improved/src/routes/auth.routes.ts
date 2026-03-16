// src/routes/auth.routes.ts

import { Router, Request, Response, NextFunction } from "express";
import { requireAuth } from "../middleware/auth";
import { AuthService, AuthError } from "../services/auth.service";

const router = Router();

const handleError = (error: unknown, res: Response, next: NextFunction) => {
  if (error instanceof AuthError) {
    return res.status(error.statusCode).json({ success: false, message: error.message });
  }
  return next(error);
};

const getHeaders = (req: Request) => ({
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
router.get("/countries", (req: Request, res: Response) => {
  const countries = AuthService.getSupportedCountries();
  return res.status(200).json({ success: true, data: countries });
});

/**
 * POST /api/auth/register
 * Inscription d'un nouvel utilisateur
 * 
 * Body: { phone, pin, countryCode? }
 * countryCode : ISO 3166-1 alpha-2 (ex: "SN", "FR", "CM"), défaut "SN"
 */
router.post(
  "/register",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { phone, pin, countryCode } = req.body;
      const result = await AuthService.register({
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
    } catch (error) {
      return handleError(error, res, next);
    }
  }
);

/**
 * POST /api/auth/login
 * Connexion avec numéro de téléphone + PIN
 * 
 * Body: { phone, pin }
 */
router.post(
  "/login",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { phone, pin } = req.body;
      const result = await AuthService.loginWithPin({
        phone,
        pin,
        ...getHeaders(req),
      });
      return res.status(200).json({
        success: true,
        message: "Connexion réussie.",
        data: result,
      });
    } catch (error) {
      return handleError(error, res, next);
    }
  }
);

// ─────────────────────────────────────────────
// ENDPOINTS PROTÉGÉS
// ─────────────────────────────────────────────

/**
 * GET /api/auth/me
 * Profil de l'utilisateur connecté (avec wallets)
 */
router.get(
  "/me",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = await AuthService.getProfile(req.user.id);
      return res.status(200).json({ success: true, data: user });
    } catch (error) {
      return handleError(error, res, next);
    }
  }
);

/**
 * PATCH /api/auth/unlock-pin/:userId
 * Déverrouillage manuel du PIN (admin seulement en production)
 */
router.patch(
  "/unlock-pin/:userId",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await AuthService.unlockPinManually({
        userId: req.params.userId,
        ...getHeaders(req),
      });
      return res.status(200).json({
        success: true,
        message: result.message,
      });
    } catch (error) {
      return handleError(error, res, next);
    }
  }
);

export default router;
