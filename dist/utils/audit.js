"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.auditLog = auditLog;
const db_1 = require("../db");
async function auditLog(input) {
    const { action, actorUserId = null, targetUserId = null, ip = null, userAgent = null, metadata, } = input;
    return db_1.prisma.auditLog.create({
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
//# sourceMappingURL=audit.js.map