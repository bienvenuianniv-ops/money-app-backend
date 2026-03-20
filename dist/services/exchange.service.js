"use strict";
// src/services/exchange.service.ts
// Gestion des taux de change pour les transferts multi-devises
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExchangeService = void 0;
const db_1 = require("../db");
// ─────────────────────────────────────────────
// Taux fixes de référence (fallback)
// À remplacer par une API externe en production (ex: ExchangeRate-API, Fixer.io)
// ─────────────────────────────────────────────
const FIXED_RATES = {
    // XOF (FCFA Ouest) ↔ autres
    "XOF_XAF": 1.0, // XOF et XAF sont à parité (1 pour 1)
    "XAF_XOF": 1.0,
    "XOF_EUR": 0.001524, // 1 XOF = 0.001524 EUR (1 EUR = 655.96 XOF)
    "EUR_XOF": 655.96,
    "XOF_GNF": 16.5, // approximatif
    "GNF_XOF": 0.0606,
    // XAF ↔ autres
    "XAF_EUR": 0.001524,
    "EUR_XAF": 655.96,
    // EUR ↔ autres
    "EUR_GHS": 12.5,
    "GHS_EUR": 0.08,
    "EUR_NGN": 1650.0,
    "NGN_EUR": 0.000606,
    // Même devise = 1
};
class ExchangeService {
    /**
     * Retourne le taux de change entre deux devises.
     * Cherche d'abord en base (taux récents), sinon utilise les taux fixes.
     */
    static async getRate(fromCurrency, toCurrency) {
        if (fromCurrency === toCurrency)
            return 1.0;
        // 1. Chercher un taux récent en base (moins de 1h)
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        const dbRate = await db_1.prisma.exchangeRate.findFirst({
            where: {
                fromCurrency,
                toCurrency,
                fetchedAt: { gte: oneHourAgo },
            },
            orderBy: { fetchedAt: "desc" },
        });
        if (dbRate) {
            return dbRate.rate;
        }
        // 2. Chercher dans les taux fixes
        const key = `${fromCurrency}_${toCurrency}`;
        const fixedRate = FIXED_RATES[key];
        if (fixedRate !== undefined) {
            // Sauvegarder en base pour le cache
            await this.saveRate(fromCurrency, toCurrency, fixedRate, "FIXED");
            return fixedRate;
        }
        // 3. Taux croisé via EUR comme devise pivot
        const fromToEur = FIXED_RATES[`${fromCurrency}_EUR`];
        const eurToTarget = FIXED_RATES[`EUR_${toCurrency}`];
        if (fromToEur && eurToTarget) {
            const crossRate = fromToEur * eurToTarget;
            await this.saveRate(fromCurrency, toCurrency, crossRate, "FIXED");
            return crossRate;
        }
        throw new Error(`Taux de change introuvable : ${fromCurrency} → ${toCurrency}`);
    }
    /**
     * Convertit un montant d'une devise vers une autre.
     * Retourne le montant converti arrondi à l'entier (pour BigInt).
     */
    static async convert(amount, fromCurrency, toCurrency) {
        const rate = await this.getRate(fromCurrency, toCurrency);
        const converted = Math.round(Number(amount) * rate);
        return {
            convertedAmount: BigInt(converted),
            rate,
        };
    }
    /**
     * Sauvegarde un taux en base de données.
     */
    static async saveRate(fromCurrency, toCurrency, rate, source = "MANUAL") {
        await db_1.prisma.exchangeRate.create({
            data: { fromCurrency, toCurrency, rate, source },
        });
    }
    /**
     * Met à jour manuellement un taux (ex: par un admin).
     */
    static async updateRate(fromCurrency, toCurrency, rate) {
        await this.saveRate(fromCurrency, toCurrency, rate, "MANUAL");
        // Sauvegarder aussi le taux inverse
        await this.saveRate(toCurrency, fromCurrency, 1 / rate, "MANUAL");
    }
    /**
     * Retourne tous les taux actifs (les plus récents par paire).
     */
    static async getAllRates() {
        // Récupère le taux le plus récent pour chaque paire
        const rates = await db_1.prisma.exchangeRate.findMany({
            orderBy: { fetchedAt: "desc" },
            distinct: ["fromCurrency", "toCurrency"],
        });
        return rates.map((r) => ({
            fromCurrency: r.fromCurrency,
            toCurrency: r.toCurrency,
            rate: r.rate,
            fetchedAt: r.fetchedAt,
        }));
    }
    /**
     * Calcule les frais de transaction selon les devises.
     * Frais plus élevés pour les conversions inter-zones.
     */
    static calculateFee(amount, fromCurrency, toCurrency) {
        if (fromCurrency === toCurrency) {
            // Même zone : 0.5%
            return BigInt(Math.round(Number(amount) * 0.005));
        }
        const sameZone = (["XOF", "XAF"].includes(fromCurrency) && ["XOF", "XAF"].includes(toCurrency));
        if (sameZone) {
            // Inter FCFA (XOF ↔ XAF) : 0.5%
            return BigInt(Math.round(Number(amount) * 0.005));
        }
        // Inter-continental (ex: XOF → EUR) : 1.5%
        return BigInt(Math.round(Number(amount) * 0.015));
    }
}
exports.ExchangeService = ExchangeService;
//# sourceMappingURL=exchange.service.js.map