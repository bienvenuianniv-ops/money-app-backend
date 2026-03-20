"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_service_1 = require("../services/auth.service");
const router = (0, express_1.Router)();
router.post("/register", async (req, res, next) => {
    try {
        const { phone, pin } = req.body;
        const result = await auth_service_1.AuthService.register({
            phone,
            pin,
            ip: req.ip ?? null,
            userAgent: req.get("user-agent") ?? null,
            requestId: typeof req.headers["x-request-id"] === "string"
                ? req.headers["x-request-id"]
                : null,
            correlationId: typeof req.headers["x-correlation-id"] === "string"
                ? req.headers["x-correlation-id"]
                : null,
        });
        return res.status(201).json({
            success: true,
            message: "Compte cree avec succes.",
            data: result,
        });
    }
    catch (error) {
        if (error instanceof auth_service_1.AuthError) {
            return res.status(error.statusCode).json({
                success: false,
                message: error.message,
            });
        }
        return next(error);
    }
});
router.post("/login", async (req, res, next) => {
    try {
        const { phone, pin } = req.body;
        const result = await auth_service_1.AuthService.loginWithPin({
            phone,
            pin,
            ip: req.ip ?? null,
            userAgent: req.get("user-agent") ?? null,
            requestId: typeof req.headers["x-request-id"] === "string"
                ? req.headers["x-request-id"]
                : null,
            correlationId: typeof req.headers["x-correlation-id"] === "string"
                ? req.headers["x-correlation-id"]
                : null,
        });
        return res.status(200).json({
            success: true,
            message: "Connexion reussie.",
            data: result,
        });
    }
    catch (error) {
        if (error instanceof auth_service_1.AuthError) {
            return res.status(error.statusCode).json({
                success: false,
                message: error.message,
            });
        }
        return next(error);
    }
});
router.get("/me", async (req, res, next) => {
    try {
        const { userId } = req.params;
        const user = await auth_service_1.AuthService.getProfile(userId);
        return res.status(200).json({
            success: true,
            data: user,
        });
    }
    catch (error) {
        if (error instanceof auth_service_1.AuthError) {
            return res.status(error.statusCode).json({
                success: false,
                message: error.message,
            });
        }
        return next(error);
    }
});
router.patch("/unlock-pin/:userId", async (req, res, next) => {
    try {
        const { userId } = req.params;
        const user = await auth_service_1.AuthService.unlockPinManually({
            userId,
            ip: req.ip ?? null,
            userAgent: req.get("user-agent") ?? null,
            requestId: typeof req.headers["x-request-id"] === "string"
                ? req.headers["x-request-id"]
                : null,
            correlationId: typeof req.headers["x-correlation-id"] === "string"
                ? req.headers["x-correlation-id"]
                : null,
        });
        return res.status(200).json({
            success: true,
            message: "PIN deverrouille avec succes.",
            data: user,
        });
    }
    catch (error) {
        if (error instanceof auth_service_1.AuthError) {
            return res.status(error.statusCode).json({
                success: false,
                message: error.message,
            });
        }
        return next(error);
    }
});
exports.default = router;
//# sourceMappingURL=auth.routes.backup.js.map