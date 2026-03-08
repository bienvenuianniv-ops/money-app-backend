import type { Request, Response, NextFunction } from "express";
import { prisma } from "../db";
import { sha256 } from "../utils/hash";
import { jsonStringifyBigInt } from "../utils/json";
import type { AuthedRequest } from "./auth";

function stableStringify(value: unknown): string {
  const seen = new WeakSet<object>();

  const normalize = (v: any): any => {
    if (v === null || v === undefined) return v;
    if (typeof v === "bigint") return v.toString();
    if (typeof v !== "object") return v;
    if (v instanceof Date) return v.toISOString();

    if (seen.has(v)) return "[Circular]";
    seen.add(v);

    if (Array.isArray(v)) return v.map(normalize);

    const out: Record<string, any> = {};
    for (const k of Object.keys(v).sort()) out[k] = normalize(v[k]);
    return out;
  };

  return JSON.stringify(normalize(value));
}

function getIdempotencyKey(req: Request): string | null {
  const raw = req.header("Idempotency-Key") ?? req.header("idempotency-key");
  if (!raw) return null;
  const key = raw.trim();
  if (key.length < 8) return null;
  return key;
}

// Endpoint stable, sans query string
function getEndpoint(req: Request): string {
  return (req.originalUrl ?? `${req.baseUrl}${req.path}`).split("?")[0];
}

function getAuthedUserId(req: AuthedRequest): string | null {
  return req.user?.id ?? null;
}

/**
 * Hook la réponse JSON et stocke { __status, body } dans IdempotencyKey.responseBody
 * (le status stocké est la vraie valeur au moment du res.json)
 */
export function finalizeIdempotency(_req: AuthedRequest, res: Response, next: NextFunction) {
  const originalJson = res.json.bind(res);

  res.json = ((body: any) => {
    const idem = res.locals.__idem as
      | { userId: string; endpoint: string; key: string }
      | undefined;

    if (idem) {
      const safeBody = JSON.parse(jsonStringifyBigInt(body));

      prisma.idempotencyKey
        .update({
          where: {
            userId_endpoint_key: {
              userId: idem.userId,
              endpoint: idem.endpoint,
              key: idem.key,
            },
          },
          data: {
            // ✅ Format strict: { __status, body }
            responseBody: jsonStringifyBigInt({
              __status: res.statusCode, // <- valeur réelle finale
              body: safeBody,
            }),
          },
        })
        .catch(() => {
          /* ne casse jamais la réponse */
        });
    }

    return originalJson(body);
  }) as any;

  return next();
}

/**
 * Vérifie / réserve / rejoue.
 * - Si déjà traité => replay strict (même status) + stop
 * - Si en cours => 409
 * - Sinon => réserve et laisse passer
 */
export async function requireIdempotency(req: AuthedRequest, res: Response, next: NextFunction) {
  const userId = getAuthedUserId(req);
  if (!userId) {
    return res.status(401).json({ ok: false, message: "Token manquant" });
  }

  const idemKey = getIdempotencyKey(req);
  if (!idemKey) {
    return res.status(400).json({ ok: false, message: "Idempotency-Key manquante ou invalide" });
  }

  const endpoint = getEndpoint(req);
  const requestHash = sha256(stableStringify(req.body ?? {}));

  const existing = await prisma.idempotencyKey.findUnique({
    where: { userId_endpoint_key: { userId, endpoint, key: idemKey } },
  });

  if (existing) {
    if (existing.requestHash !== requestHash) {
      return res.status(409).json({
        ok: false,
        message: "Idempotency-Key déjà utilisée avec un autre payload",
      });
    }

    if (existing.responseBody) {
      const replay = JSON.parse(existing.responseBody);

      // ✅ strict: même status
   if (replay && typeof replay.__status === "number" && "body" in replay) {
  return res.status(200).json(replay.body);
}

      // compat ancien format (si tu as de vieilles lignes)
      return res.status(200).json(replay.body);
    }

    return res.status(409).json({ ok: false, message: "Requête déjà en cours, réessaie" });
  }

  // Réserver (avec gestion de course)
  try {
    await prisma.idempotencyKey.create({
      data: { key: idemKey, userId, endpoint, requestHash },
    });
  } catch {
    // relire si une autre requête vient de créer la même clé
    const again = await prisma.idempotencyKey.findUnique({
      where: { userId_endpoint_key: { userId, endpoint, key: idemKey } },
    });

    if (again && again.requestHash === requestHash && again.responseBody) {
      const replay = JSON.parse(again.responseBody);

      if (replay && typeof replay.__status === "number" && "body" in replay) {
  // REPLAY doit être 200 (pas 201), mais on renvoie le même body
  return res.status(200).json(replay);
}

      return res.status(200).json(replay);
    }

    return res.status(409).json({ ok: false, message: "Idempotency-Key déjà utilisée" });
  }

  // Données pour finalizeIdempotency
  res.locals.__idem = { userId, endpoint, key: idemKey };

  return next();
}