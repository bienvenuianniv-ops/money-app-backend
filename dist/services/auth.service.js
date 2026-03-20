"use strict";
// src/services/auth.service.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = exports.AuthError = void 0;
const bcrypt_1 = __importDefault(require("bcrypt"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const db_1 = require("../db");
const audit_service_1 = require("./audit.service");
const countries_1 = require("../config/countries");
// ─────────────────────────────────────────────
// ERREUR MÉTIER
// ─────────────────────────────────────────────
class AuthError extends Error {
    constructor(message, statusCode = 400) {
        super(message);
        this.name = "AuthError";
        this.statusCode = statusCode;
    }
}
exports.AuthError = AuthError;
// ─────────────────────────────────────────────
// CONSTANTES
// ─────────────────────────────────────────────
const MAX_PIN_ATTEMPTS = 5;
const PIN_LOCK_MINUTES = 30;
const JWT_EXPIRY = "7d";
const BCRYPT_ROUNDS = 12;
// ─────────────────────────────────────────────
// SERVICE
// ─────────────────────────────────────────────
class AuthService {
    // ── INSCRIPTION ───────────────────────────────
    static async register(input) {
        const { phone, pin, countryCode = "SN", ip = null, userAgent = null, requestId = null, correlationId = null, } = input;
        // Validation numéro de téléphone
        if (!phone || typeof phone !== "string") {
            throw new AuthError("Le numéro de téléphone est requis.", 400);
        }
        // Validation PIN
        if (!pin || typeof pin !== "string" || !/^\d{4,6}$/.test(pin)) {
            throw new AuthError("Le PIN doit contenir entre 4 et 6 chiffres.", 400);
        }
        // Validation pays
        const upperCountryCode = countryCode.toUpperCase();
        if (!(0, countries_1.isCountrySupported)(upperCountryCode)) {
            const activeCountries = Object.values(countries_1.SUPPORTED_COUNTRIES)
                .filter((c) => c.isActive)
                .map((c) => `${c.code} (${c.name})`)
                .join(", ");
            throw new AuthError(`Pays non supporté : ${countryCode}. Pays disponibles : ${activeCountries}`, 400);
        }
        const country = (0, countries_1.getCountryByCode)(upperCountryCode);
        // Normalisation du numéro : enlever le dialCode s'il est présent, puis le rajouter
        const normalizedPhone = this.normalizePhone(phone, country.dialCode);
        // Vérification doublon
        const existingUser = await db_1.prisma.user.findUnique({
            where: { phone: normalizedPhone },
        });
        if (existingUser) {
            throw new AuthError("Ce numéro est déjà enregistré.", 409);
        }
        // Hash PIN
        const pinHash = await bcrypt_1.default.hash(pin, BCRYPT_ROUNDS);
        // Création utilisateur + wallet dans la devise du pays
        const user = await db_1.prisma.$transaction(async (tx) => {
            const newUser = await tx.user.create({
                data: {
                    phone: normalizedPhone,
                    pinHash,
                    countryCode: upperCountryCode,
                    dialCode: country.dialCode,
                    role: "USER",
                    status: "ACTIVE",
                },
            });
            // Wallet principal dans la devise du pays
            await tx.wallet.create({
                data: {
                    userId: newUser.id,
                    currency: country.currency,
                    balance: 0n,
                    isActive: true,
                },
            });
            return newUser;
        });
        // Audit
        await audit_service_1.AuditService.log({
            action: "USER_REGISTER",
            actorUserId: user.id,
            ip,
            userAgent,
            requestId,
            correlationId,
            severity: "INFO",
            metadata: { phone: normalizedPhone, countryCode: upperCountryCode, currency: country.currency },
        });
        const token = this.generateToken(user.id);
        return {
            token,
            user: {
                id: user.id,
                phone: user.phone,
                countryCode: user.countryCode,
                dialCode: user.dialCode,
                currency: country.currency,
                role: user.role,
                status: user.status,
                createdAt: user.createdAt,
            },
        };
    }
    // ── CONNEXION ─────────────────────────────────
    static async loginWithPin(input) {
        const { phone, pin, ip = null, userAgent = null, requestId = null, correlationId = null } = input;
        if (!phone || !pin) {
            throw new AuthError("Numéro de téléphone et PIN requis.", 400);
        }
        const user = await db_1.prisma.user.findUnique({ where: { phone } });
        if (!user) {
            throw new AuthError("Numéro ou PIN incorrect.", 401);
        }
        if (user.status === "SUSPENDED") {
            throw new AuthError("Compte suspendu. Contactez le support.", 403);
        }
        // Vérification verrouillage PIN
        if (user.pinLockedUntil && new Date() < user.pinLockedUntil) {
            const remaining = Math.ceil((user.pinLockedUntil.getTime() - Date.now()) / 60000);
            throw new AuthError(`Trop de tentatives. Réessayez dans ${remaining} minute(s).`, 429);
        }
        // Vérification PIN
        const isPinValid = await bcrypt_1.default.compare(pin, user.pinHash);
        if (!isPinValid) {
            const newAttempts = user.failedPinAttempts + 1;
            const shouldLock = newAttempts >= MAX_PIN_ATTEMPTS;
            await db_1.prisma.user.update({
                where: { id: user.id },
                data: {
                    failedPinAttempts: newAttempts,
                    pinLockedUntil: shouldLock
                        ? new Date(Date.now() + PIN_LOCK_MINUTES * 60000)
                        : null,
                },
            });
            await audit_service_1.AuditService.log({
                action: "LOGIN_FAILED",
                actorUserId: user.id,
                ip,
                userAgent,
                requestId,
                correlationId,
                severity: shouldLock ? "WARN" : "INFO",
                metadata: { attempts: newAttempts, locked: shouldLock },
            });
            const remaining = MAX_PIN_ATTEMPTS - newAttempts;
            if (shouldLock) {
                throw new AuthError(`PIN incorrect. Compte bloqué ${PIN_LOCK_MINUTES} minutes.`, 429);
            }
            throw new AuthError(`PIN incorrect. Il vous reste ${remaining} tentative(s).`, 401);
        }
        // Succès : remise à zéro des tentatives
        await db_1.prisma.user.update({
            where: { id: user.id },
            data: {
                failedPinAttempts: 0,
                pinLockedUntil: null,
                lastLoginAt: new Date(),
            },
        });
        await audit_service_1.AuditService.log({
            action: "LOGIN_SUCCESS",
            actorUserId: user.id,
            ip,
            userAgent,
            requestId,
            correlationId,
            severity: "INFO",
        });
        const token = this.generateToken(user.id);
        return {
            token,
            user: {
                id: user.id,
                phone: user.phone,
                countryCode: user.countryCode,
                dialCode: user.dialCode,
                role: user.role,
                status: user.status,
                lastLoginAt: new Date(),
            },
        };
    }
    // ── PROFIL ────────────────────────────────────
    static async getProfile(userId) {
        const user = await db_1.prisma.user.findUnique({
            where: { id: userId },
            include: {
                wallets: { where: { isActive: true } },
            },
        });
        if (!user)
            throw new AuthError("Utilisateur introuvable.", 404);
        const country = (0, countries_1.getCountryByCode)(user.countryCode);
        return {
            id: user.id,
            phone: user.phone,
            countryCode: user.countryCode,
            dialCode: user.dialCode,
            countryName: country?.name || null,
            role: user.role,
            status: user.status,
            lastLoginAt: user.lastLoginAt,
            createdAt: user.createdAt,
            wallets: user.wallets.map((w) => ({
                id: w.id,
                currency: w.currency,
                balance: w.balance.toString(),
            })),
        };
    }
    // ── DÉVERROUILLAGE PIN ────────────────────────
    static async unlockPinManually(input) {
        const { userId, ip = null, userAgent = null, requestId = null, correlationId = null } = input;
        const user = await db_1.prisma.user.findUnique({ where: { id: userId } });
        if (!user)
            throw new AuthError("Utilisateur introuvable.", 404);
        await db_1.prisma.user.update({
            where: { id: userId },
            data: { failedPinAttempts: 0, pinLockedUntil: null },
        });
        await audit_service_1.AuditService.log({
            action: "PIN_UNLOCKED_MANUALLY",
            actorUserId: userId,
            ip,
            userAgent,
            requestId,
            correlationId,
            severity: "WARN",
        });
        return { message: "PIN déverrouillé avec succès." };
    }
    // ── PAYS SUPPORTÉS ────────────────────────────
    static getSupportedCountries() {
        return Object.values(countries_1.SUPPORTED_COUNTRIES)
            .filter((c) => c.isActive)
            .map((c) => ({
            code: c.code,
            name: c.name,
            dialCode: c.dialCode,
            currency: c.currency,
            region: c.region,
        }));
    }
    // ── HELPERS PRIVÉS ────────────────────────────
    static generateToken(userId) {
        const secret = process.env.JWT_SECRET;
        if (!secret)
            throw new Error("JWT_SECRET non défini.");
        return jsonwebtoken_1.default.sign({ userId }, secret, { expiresIn: JWT_EXPIRY });
    }
    /**
     * Normalise un numéro de téléphone :
     * - Enlève les espaces, tirets
     * - Ajoute l'indicatif si absent
     */
    static normalizePhone(phone, dialCode) {
        let cleaned = phone.replace(/[\s\-().]/g, "");
        // Si commence par 00, remplacer par +
        if (cleaned.startsWith("00")) {
            cleaned = "+" + cleaned.slice(2);
        }
        // Si commence par 0 (local), ajouter l'indicatif
        if (cleaned.startsWith("0") && !cleaned.startsWith("00")) {
            cleaned = dialCode + cleaned.slice(1);
        }
        // Si ne commence pas par +, ajouter l'indicatif
        if (!cleaned.startsWith("+")) {
            cleaned = dialCode + cleaned;
        }
        return cleaned;
    }
}
exports.AuthService = AuthService;
//# sourceMappingURL=auth.service.js.map