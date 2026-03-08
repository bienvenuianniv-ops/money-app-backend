import express from "express";
import cors from "cors";
import "dotenv/config";

// ROUTES
import authRoutes from "./routes/auth.routes";
import walletRoutes from "./routes/wallet.routes";
import transactionsRoutes from "./routes/transactions.routes";
import devRoutes from "./routes/dev.routes";

// RATE LIMIT
import { globalLimiter } from "./middleware/rateLimit";

// ERROR HANDLER
import { errorHandler } from "./middleware/error";

const app = express();

// ======================
// DEBUG ENDPOINT
// ======================
app.get("/__debug_app", (_req, res) => {
  return res.json({ ok: true, version: "APP_TS_ACTIVE_V1" });
});

// ======================
// MIDDLEWARES
// ======================
app.use(cors());
app.use(express.json({ limit: "1mb" }));

// ✅ GLOBAL RATE LIMIT (après cors/json, avant routes)
app.use(globalLimiter);

// ======================
// HEALTH CHECK
// ======================
app.get("/health", (_req, res) => {
  return res.json({ ok: true, message: "API backend fonctionne" });
});

// ======================
// ROUTES
// ======================
if (process.env.NODE_ENV !== "test") {
  console.log({
    authRoutesType: typeof authRoutes,
    walletRoutesType: typeof walletRoutes,
    transactionsRoutesType: typeof transactionsRoutes,
    devRoutesType: typeof devRoutes,
  });
}
app.use(authRoutes);
app.use(walletRoutes);
app.use(transactionsRoutes);
app.use(devRoutes);

// ======================
// 404 JSON
// ======================
app.use((_req, res) => {
  return res.status(404).json({ ok: false, message: "Route introuvable" });
});

// ======================
// ERROR HANDLER (dernier)
// ======================
app.use(errorHandler);

export default app;
