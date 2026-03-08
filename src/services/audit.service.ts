import { prisma } from "../db";

type AuditInput = {
  action: string;
  actorUserId?: string | null;
  targetUserId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  metadata?: any;
};

export class AuditService {
  static async log(input: AuditInput) {
    const { action, actorUserId, targetUserId, ip, userAgent, metadata } = input;

    await prisma.auditLog.create({
      data: {
        action,
        actorUserId: actorUserId ?? null,
        targetUserId: targetUserId ?? null,
        ip: ip ?? null,
        userAgent: userAgent ?? null,
        metadata: metadata ? JSON.stringify(metadata) : null,
      },
    });
  }
}
