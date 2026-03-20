"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuditService = void 0;
const db_1 = require("../db");
const client_1 = require("@prisma/client");
class AuditService {
    static async log(input) {
        const { action, actorUserId = null, targetUserId = null, ip = null, userAgent = null, severity = "INFO", requestId = null, correlationId = null, metadata = null, silent = true, } = input;
        try {
            await db_1.prisma.auditLog.create({
                data: {
                    action,
                    actorUserId,
                    targetUserId,
                    ip,
                    userAgent,
                    severity,
                    requestId,
                    correlationId,
                    metadata: metadata ?? client_1.Prisma.JsonNull,
                },
            });
        }
        catch (error) {
            console.error("[AUDIT_LOG_ERROR]", {
                action,
                actorUserId,
                targetUserId,
                severity,
                requestId,
                correlationId,
                error,
            });
            if (!silent) {
                throw error;
            }
        }
    }
    static async info(input) {
        await this.log({ ...input, severity: "INFO" });
    }
    static async warn(input) {
        await this.log({ ...input, severity: "WARN" });
    }
    static async error(input) {
        await this.log({ ...input, severity: "ERROR" });
    }
    static fireAndForget(input) {
        void this.log({ ...input, silent: true });
    }
    static async logAuthSuccess(params) {
        await this.info({
            action: "AUTH_LOGIN_SUCCESS",
            actorUserId: params.actorUserId,
            ip: params.ip,
            userAgent: params.userAgent,
            requestId: params.requestId,
            correlationId: params.correlationId,
            metadata: params.metadata ?? null,
        });
    }
    static async logAuthFailure(params) {
        await this.warn({
            action: "AUTH_LOGIN_FAILED",
            targetUserId: params.targetUserId ?? null,
            ip: params.ip,
            userAgent: params.userAgent,
            requestId: params.requestId,
            correlationId: params.correlationId,
            metadata: params.metadata ?? null,
        });
    }
    static async logTransfer(params) {
        const severity = params.status === "FAILED" ? "ERROR" : "INFO";
        await this.log({
            action: `TRANSFER_${params.status}`,
            actorUserId: params.actorUserId,
            targetUserId: params.targetUserId ?? null,
            ip: params.ip,
            userAgent: params.userAgent,
            requestId: params.requestId,
            correlationId: params.correlationId,
            severity,
            metadata: {
                transactionId: params.transactionId ?? null,
                amount: params.amount,
                fee: params.fee ?? 0,
                currency: params.currency ?? "XOF",
                fromWalletId: params.fromWalletId ?? null,
                toWalletId: params.toWalletId ?? null,
            },
        });
    }
    static async logPinLocked(params) {
        await this.warn({
            action: "PIN_LOCKED",
            actorUserId: params.actorUserId,
            ip: params.ip,
            userAgent: params.userAgent,
            requestId: params.requestId,
            correlationId: params.correlationId,
            metadata: params.metadata ?? null,
        });
    }
    static async logPinUnlocked(params) {
        await this.info({
            action: "PIN_UNLOCKED",
            actorUserId: params.actorUserId,
            ip: params.ip,
            userAgent: params.userAgent,
            requestId: params.requestId,
            correlationId: params.correlationId,
            metadata: params.metadata ?? null,
        });
    }
    static async logUserSuspended(params) {
        await this.warn({
            action: "USER_SUSPENDED",
            actorUserId: params.actorUserId ?? null,
            targetUserId: params.targetUserId,
            ip: params.ip,
            userAgent: params.userAgent,
            requestId: params.requestId,
            correlationId: params.correlationId,
            metadata: params.metadata ?? null,
        });
    }
    static async logWalletCreated(params) {
        await this.info({
            action: "WALLET_CREATED",
            actorUserId: params.actorUserId,
            ip: params.ip,
            userAgent: params.userAgent,
            requestId: params.requestId,
            correlationId: params.correlationId,
            metadata: {
                walletId: params.walletId,
                currency: params.currency ?? "XOF",
                extra: params.metadata ?? null,
            },
        });
    }
}
exports.AuditService = AuditService;
//# sourceMappingURL=audit.service.js.map