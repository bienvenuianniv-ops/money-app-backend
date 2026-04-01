import "dotenv/config";
import { PrismaClient } from "@prisma/client";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL manquant dans .env");
}

export const prisma = new PrismaClient({
  log: ["error", "warn"],
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
});

// Reconnexion automatique si Neon coupe la connexion
prisma.$connect().catch((e) => {
  console.error("[DB] Connexion initiale échouée, nouvelle tentative...", e);
});

// Retry automatique sur erreurs de connexion
const MAX_RETRIES = 3;

export async function withRetry<T>(
  operation: () => Promise<T>,
  retries = MAX_RETRIES
): Promise<T> {
  try {
    return await operation();
  } catch (error: any) {
    const isConnectionError =
      error?.code === "P1001" ||
      error?.code === "P1002" ||
      error?.code === "P1008" ||
      error?.message?.includes("terminating connection") ||
      error?.message?.includes("Connection refused");

    if (isConnectionError && retries > 0) {
      console.warn(`[DB] Retry dans 1s... (${retries} essais restants)`);
      await new Promise((r) => setTimeout(r, 1000));
      await prisma.$connect();
      return withRetry(operation, retries - 1);
    }
    throw error;
  }
}