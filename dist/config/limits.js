"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DAILY_OUT_LIMIT = void 0;
exports.startOfUtcDay = startOfUtcDay;
exports.DAILY_OUT_LIMIT = BigInt(process.env.DAILY_OUT_LIMIT ?? "200000"); // XOF/jour
function startOfUtcDay(d = new Date()) {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
}
//# sourceMappingURL=limits.js.map