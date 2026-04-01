"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.prisma = void 0;
exports.withRetry = withRetry;
require("dotenv/config");
const client_1 = require("@prisma/client");
if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL manquant dans .env");
}
exports.prisma = new client_1.PrismaClient({
    log: ["error", "warn"],
    datasources: {
        db: {
            url: process.env.DATABASE_URL,
        },
    },
});
// Reconnexion automatique si Neon coupe la connexion
exports.prisma.$connect().catch((e) => {
    console.error("[DB] Connexion initiale échouée, nouvelle tentative...", e);
});
// Retry automatique sur erreurs de connexion
const MAX_RETRIES = 3;
async function withRetry(operation, retries = MAX_RETRIES) {
    try {
        return await operation();
    }
    catch (error) {
        const isConnectionError = error?.code === "P1001" ||
            error?.code === "P1002" ||
            error?.code === "P1008" ||
            error?.message?.includes("terminating connection") ||
            error?.message?.includes("Connection refused");
        if (isConnectionError && retries > 0) {
            console.warn(`[DB] Retry dans 1s... (${retries} essais restants)`);
            await new Promise((r) => setTimeout(r, 1000));
            await exports.prisma.$connect();
            return withRetry(operation, retries - 1);
        }
        throw error;
    }
}
//# sourceMappingURL=db.js.map