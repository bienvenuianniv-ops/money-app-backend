"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.finalizeIdempotency = finalizeIdempotency;
exports.requireIdempotency = requireIdempotency;
const db_1 = require("../db");
const hash_1 = require("../utils/hash");
const json_1 = require("../utils/json");
function stableStringify(value) {
    const seen = new WeakSet();
    const normalize = (v) => {
        if (v === null || v === undefined)
            return v;
        if (typeof v === "bigint")
            return v.toString();
        if (typeof v !== "object")
            return v;
        if (v instanceof Date)
            return v.toISOString();
        if (seen.has(v))
            return "[Circular]";
        seen.add(v);
        if (Array.isArray(v))
            return v.map(normalize);
        const out = {};
        for (const k of Object.keys(v).sort()) {
            out[k] = normalize(v[k]);
        }
        return out;
    };
    return JSON.stringify(normalize(value));
}
function getIdempotencyKey(req) {
    const raw = req.header("Idempotency-Key") ?? req.header("idempotency-key");
    if (!raw)
        return null;
    const key = raw.trim();
    if (key.length < 8)
        return null;
    return key;
}
function getEndpoint(req) {
    return (req.originalUrl || `${req.baseUrl}${req.path}`).split("?")[0];
}
function getAuthedUserId(req) {
    return req.user?.id ?? null;
}
/**
 * Intercepte la reponse JSON et stocke:
 * { __status, body }
 */
function finalizeIdempotency(_req, res, next) {
    const originalJson = res.json.bind(res);
    res.json = ((body) => {
        const idem = res.locals.__idem;
        if (idem) {
            const safeBody = JSON.parse((0, json_1.jsonStringifyBigInt)(body));
            db_1.prisma.idempotencyKey
                .update({
                where: {
                    userId_endpoint_key: {
                        userId: idem.userId,
                        endpoint: idem.endpoint,
                        key: idem.key,
                    },
                },
                data: {
                    responseBody: (0, json_1.jsonStringifyBigInt)({
                        __status: res.statusCode,
                        body: safeBody,
                    }),
                },
            })
                .catch(() => {
                // ne jamais casser la reponse
            });
        }
        return originalJson(body);
    });
    next();
}
/**
 * Verifie / reserve / rejoue
 */
async function requireIdempotency(req, res, next) {
    const userId = getAuthedUserId(req);
    if (!userId) {
        return res.status(401).json({
            ok: false,
            message: "Token manquant",
        });
    }
    const idemKey = getIdempotencyKey(req);
    if (!idemKey) {
        return res.status(400).json({
            ok: false,
            message: "Idempotency-Key manquante ou invalide",
        });
    }
    const endpoint = getEndpoint(req);
    const requestHash = (0, hash_1.sha256)(stableStringify(req.body ?? {}));
    const existing = await db_1.prisma.idempotencyKey.findUnique({
        where: {
            userId_endpoint_key: {
                userId,
                endpoint,
                key: idemKey,
            },
        },
    });
    if (existing) {
        if (existing.requestHash !== requestHash) {
            return res.status(409).json({
                ok: false,
                message: "Idempotency-Key deja utilisee avec un autre payload",
            });
        }
        if (existing.responseBody) {
            const replay = JSON.parse(existing.responseBody);
            if (replay && typeof replay.__status === "number" && "body" in replay) {
                return res.status(200).json(replay.body);
            }
            return res.status(200).json(replay);
        }
        return res.status(409).json({
            ok: false,
            message: "Requete deja en cours, reessaie",
        });
    }
    try {
        await db_1.prisma.idempotencyKey.create({
            data: {
                key: idemKey,
                userId,
                endpoint,
                requestHash,
            },
        });
    }
    catch {
        const again = await db_1.prisma.idempotencyKey.findUnique({
            where: {
                userId_endpoint_key: {
                    userId,
                    endpoint,
                    key: idemKey,
                },
            },
        });
        if (again && again.requestHash === requestHash && again.responseBody) {
            const replay = JSON.parse(again.responseBody);
            if (replay && typeof replay.__status === "number" && "body" in replay) {
                return res.status(200).json(replay.body);
            }
            return res.status(200).json(replay);
        }
        return res.status(409).json({
            ok: false,
            message: "Idempotency-Key deja utilisee",
        });
    }
    res.locals.__idem = {
        userId,
        endpoint,
        key: idemKey,
    };
    next();
}
//# sourceMappingURL=idempotency.js.map