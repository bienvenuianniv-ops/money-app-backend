"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.prisma = void 0;
require("dotenv/config");
const client_1 = require("@prisma/client");
if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL manquant dans .env");
}
exports.prisma = new client_1.PrismaClient({
    log: ["error", "warn"],
});
//# sourceMappingURL=db.js.map