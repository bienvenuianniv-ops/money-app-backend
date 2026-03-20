"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
require("dotenv/config");
// ROUTES
const auth_routes_1 = __importDefault(require("./routes/auth.routes"));
const wallet_routes_1 = __importDefault(require("./routes/wallet.routes"));
const transactions_routes_1 = __importDefault(require("./routes/transactions.routes"));
const dev_routes_1 = __importDefault(require("./routes/dev.routes"));
const notchpay_routes_1 = __importDefault(require("./routes/notchpay.routes"));
const fedapay_routes_1 = __importDefault(require("./routes/fedapay.routes"));
const admin_routes_1 = __importDefault(require("./routes/admin.routes"));
// MIDDLEWARES
const rateLimit_1 = require("./middleware/rateLimit");
// ERROR HANDLER
const error_1 = require("./middleware/error");
const app = (0, express_1.default)();
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
app.use((0, cors_1.default)({
    origin: ['https://mayouservice.com', 'http://localhost:4000'],
    credentials: true
}));
app.use(express_1.default.json({ limit: "1mb" }));
app.use(rateLimit_1.globalLimiter);
// ======================
// HEALTH CHECK
// ======================
app.get("/health", (_req, res) => {
    return res.json({ ok: true, message: "API backend fonctionne" });
});
// ======================
// ROUTES (STABLE)
// ======================
app.use("/api/auth", auth_routes_1.default);
app.use("/api", wallet_routes_1.default);
app.use("/api", transactions_routes_1.default);
app.use("/api", dev_routes_1.default);
app.use("/api", notchpay_routes_1.default);
app.use("/api", fedapay_routes_1.default);
app.use("/api", admin_routes_1.default);
// ======================
// 404 JSON
// ======================
app.use((_req, res) => {
    return res.status(404).json({ ok: false, message: "Route introuvable" });
});
// ======================
// GLOBAL ERROR HANDLER
// ======================
app.use(error_1.errorHandler);
exports.default = app;
//# sourceMappingURL=app.js.map