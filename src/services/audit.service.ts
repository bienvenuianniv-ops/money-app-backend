import { prisma } from "../db";
import { Prisma } from "@prisma/client";

type AuditSeverity = "INFO" | "WARN" | "ERROR";

type AuditMetadata =
  | Prisma.JsonObject
  | Prisma.JsonArray
  | string
  | number
  | boolean
  | null;

export type AuditInput = {
  action: string;
  actorUserId?: string | null;
  targetUserId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  severity?: AuditSeverity;
  requestId?: string | null;
  correlationId?: string | null;
  metadata?: AuditMetadata;
  silent?: boolean;
};

export class AuditService {
  static async log(input: AuditInput): Promise<void> {
    const {
      action,
      actorUserId = null,
      targetUserId = null,
      ip = null,
      userAgent = null,
      severity = "INFO",
      requestId = null,
      correlationId = null,
      metadata = null,
      silent = true,
    } = input;

    try {
      await prisma.auditLog.create({
        data: {
          action,
          actorUserId,
          targetUserId,
          ip,
          userAgent,
          severity,
          requestId,
          correlationId,
          metadata: metadata ?? Prisma.JsonNull,
        },
      });
    } catch (error) {
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

  static async info(input: Omit<AuditInput, "severity">): Promise<void> {
    await this.log({ ...input, severity: "INFO" });
  }

  static async warn(input: Omit<AuditInput, "severity">): Promise<void> {
    await this.log({ ...input, severity: "WARN" });
  }

  static async error(input: Omit<AuditInput, "severity">): Promise<void> {
    await this.log({ ...input, severity: "ERROR" });
  }

  static fireAndForget(input: AuditInput): void {
    void this.log({ ...input, silent: true });
  }

  static async logAuthSuccess(params: {
    actorUserId: string;
    ip?: string | null;
    userAgent?: string | null;
    requestId?: string | null;
    correlationId?: string | null;
    metadata?: AuditMetadata;
  }): Promise<void> {
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

  static async logAuthFailure(params: {
    targetUserId?: string | null;
    ip?: string | null;
    userAgent?: string | null;
    requestId?: string | null;
    correlationId?: string | null;
    metadata?: AuditMetadata;
  }): Promise<void> {
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

  static async logTransfer(params: {
    actorUserId: string;
    targetUserId?: string | null;
    ip?: string | null;
    userAgent?: string | null;
    requestId?: string | null;
    correlationId?: string | null;
    amount: string | number;
    currency?: string;
    transactionId?: string | null;
    fromWalletId?: string | null;
    toWalletId?: string | null;
    status: "PENDING" | "SUCCESS" | "FAILED";
    fee?: string | number;
  }): Promise<void> {
    const severity: AuditSeverity =
      params.status === "FAILED" ? "ERROR" : "INFO";

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

  static async logPinLocked(params: {
    actorUserId: string;
    ip?: string | null;
    userAgent?: string | null;
    requestId?: string | null;
    correlationId?: string | null;
    metadata?: AuditMetadata;
  }): Promise<void> {
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

  static async logPinUnlocked(params: {
    actorUserId: string;
    ip?: string | null;
    userAgent?: string | null;
    requestId?: string | null;
    correlationId?: string | null;
    metadata?: AuditMetadata;
  }): Promise<void> {
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

  static async logUserSuspended(params: {
    actorUserId?: string | null;
    targetUserId: string;
    ip?: string | null;
    userAgent?: string | null;
    requestId?: string | null;
    correlationId?: string | null;
    metadata?: AuditMetadata;
  }): Promise<void> {
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

  static async logWalletCreated(params: {
    actorUserId: string;
    ip?: string | null;
    userAgent?: string | null;
    requestId?: string | null;
    correlationId?: string | null;
    walletId: string;
    currency?: string;
    metadata?: AuditMetadata;
  }): Promise<void> {
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