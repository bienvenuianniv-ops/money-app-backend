import { prisma } from "../db";

type AuditInput = {
  action: string;
  actorUserId?: string | null;
  targetUserId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  metadata?: unknown;
};

export async function auditLog(input: AuditInput) {
  const {
    action,
    actorUserId = null,
    targetUserId = null,
    ip = null,
    userAgent = null,
    metadata,
  } = input;

  return prisma.auditLog.create({
    data: {
      action,
      actorUserId,
      targetUserId,
      ip,
      userAgent,
      metadata: metadata ?? undefined,
    },
  });
}