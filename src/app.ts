import express from "express";
import cors from "cors";
import "dotenv/config";

// ROUTES
import authRoutes from "./routes/auth.routes";
import walletRoutes from "./routes/wallet.routes";
import transactionsRoutes from "./routes/transactions.routes";
import devRoutes from "./routes/dev.routes";
import notchpayRoutes from "./routes/notchpay.routes";
import fedapayRoutes from "./routes/fedapay.routes";
import adminRoutes from "./routes/admin.routes";
// MIDDLEWARES
import { globalLimiter } from "./middleware/rateLimit";

// ERROR HANDLER
import { errorHandler } from "./middleware/error";

const app = express();

// ======================
// TRUST PROXY (Render)
// ======================
app.set("trust proxy", 1);

// ======================
// DEBUG ENDPOINT
// ======================
app.get("/__debug_app", (_req, res) => {
  return res.json({ ok: true, version: "APP_TS_ACTIVE_V1" });
});

// ======================
// MIDDLEWARES
// ======================
app.use(cors({
  origin: ['https://mayouservice.com', 'http://localhost:4000'],
  credentials: true
}));
app.use(express.json({ limit: "1mb" }));
app.use(globalLimiter);

// ======================
// HEALTH CHECK
// ======================
app.get("/health", (_req, res) => {
  return res.json({ ok: true, message: "API backend fonctionne" });
});

// ======================
// ROUTES (STABLE)
// ======================
app.use("/api/auth", authRoutes);
app.use("/api", walletRoutes);
app.use("/api", transactionsRoutes);
app.use("/api", devRoutes);
app.use("/api", notchpayRoutes);
app.use("/api", fedapayRoutes);
app.use("/api", adminRoutes);

// ======================
// 404 JSON
// ======================
app.use((_req, res) => {
  return res.status(404).json({ ok: false, message: "Route introuvable" });
});

// ======================
// GLOBAL ERROR HANDLER
// ======================
app.use(errorHandler);

export default app;