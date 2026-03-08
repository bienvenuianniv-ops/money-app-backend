import { prisma } from "../db";

type AuditPayload = {
  actorUserId?: string | null;
  action: string;
  targetUserId?: string | null;
  meta?: any;
};

export async function auditLog(payload: AuditPayload) {
  const { actorUserId = null, action, targetUserId = null, meta = null } = payload;

  // Si ton modèle Prisma s'appelle différemment, on ajustera,
  // mais d'après dev.routes.ts tu as prisma.auditLog.findMany donc c'est bon.
  return prisma.auditLog.create({
    data: {
      actorUserId,
      action,
      targetUserId,
      meta,
    },
  });
}

type AuditInput = {
  action: string;
  actorUserId?: string | null;
  targetUserId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  metadata?: any;
};

export async function auditLog(input: AuditInput) {
  const {
    action,
    actorUserId = null,
    targetUserId = null,
    ip = null,
    userAgent = null,
    metadata = null,
  } = input;

  await prisma.auditLog.create({
    data: {
      action,
      actorUserId,
      targetUserId,
      ip,
      userAgent,
      metadata: metadata ? JSON.stringify(metadata) : null,
    },
  });
}
