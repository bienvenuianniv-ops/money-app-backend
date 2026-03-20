"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = errorHandler;
function errorHandler(err, _req, res, _next) {
    console.error(err);
    if (res.headersSent)
        return;
    const status = Number.isInteger(err?.status) ? err.status : 500;
    const message = err?.message ?? "Erreur serveur";
    return res.status(status).json({ ok: false, message });
}
//# sourceMappingURL=error.js.map