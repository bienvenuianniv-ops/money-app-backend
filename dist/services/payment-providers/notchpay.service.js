"use strict";
// src/services/payment-providers/notchpay.service.ts
// Notchpay — Sénégal, Cameroun, Côte d'Ivoire et plus
// Docs : https://developer.notchpay.co
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.notchpay = exports.NotchpayService = void 0;
const axios_1 = __importDefault(require("axios"));
const NOTCHPAY_BASE = "https://api.notchpay.co";
class NotchpayService {
    constructor(config) {
        this.config = config;
    }
    get headers() {
        return {
            Authorization: this.config.publicKey,
            "Content-Type": "application/json",
        };
    }
    get privateHeaders() {
        return {
            Authorization: this.config.privateKey,
            "Content-Type": "application/json",
        };
    }
    // ── DÉPÔT : Initier un paiement ───────────────────────────────
    async initiateDeposit(params) {
        const payload = {
            amount: params.amount,
            currency: params.currency,
            email: params.email,
            phone: params.phone,
            name: params.name,
            reference: params.reference,
            description: params.description,
            callback: this.config.callbackUrl,
        };
        const response = await axios_1.default.post(`${NOTCHPAY_BASE}/payments/initialize`, payload, { headers: this.headers });
        const data = response.data;
        if (!data.authorization_url && !data.transaction?.authorization_url) {
            throw new Error(`Notchpay erreur: ${JSON.stringify(data)}`);
        }
        return {
            reference: data.transaction?.reference || params.reference,
            authorizationUrl: data.authorization_url || data.transaction?.authorization_url,
            status: data.transaction?.status || "pending",
            raw: data,
        };
    }
    // ── VÉRIFICATION DU STATUT ────────────────────────────────────
    async checkPaymentStatus(reference) {
        const response = await axios_1.default.get(`${NOTCHPAY_BASE}/payments/${reference}`, { headers: this.headers });
        const data = response.data;
        const tx = data.transaction || data;
        return {
            status: tx.status,
            amount: tx.amount || 0,
            currency: tx.currency || "XAF",
            raw: data,
        };
    }
    // ── RETRAIT (TRANSFER) ────────────────────────────────────────
    async initiateWithdraw(params) {
        const payload = {
            amount: params.amount,
            currency: params.currency,
            destination: params.phone,
            channel: params.channel,
            description: params.description || "Retrait PayWest",
            reference: params.reference,
            beneficiary: {
                name: params.name,
                email: params.email || `${params.phone}@paywest.app`,
                phone: params.phone,
            },
        };
        try {
            const response = await axios_1.default.post(`${NOTCHPAY_BASE}/transfers`, payload, { headers: this.privateHeaders });
            const data = response.data;
            return {
                success: data.status === "sent" || data.status === "pending",
                reference: data.transfer?.reference || params.reference,
                message: data.message || "Retrait initié",
                raw: data,
            };
        }
        catch (error) {
            return {
                success: false,
                reference: params.reference,
                message: error?.response?.data?.message || error.message || "Erreur retrait",
                raw: error?.response?.data,
            };
        }
    }
    // ── CANAUX DISPONIBLES PAR PAYS ───────────────────────────────
    static getChannels(countryCode) {
        const channels = {
            SN: [
                { id: "sn.wave", name: "Wave Sénégal" },
                { id: "sn.orange", name: "Orange Money Sénégal" },
                { id: "sn.free", name: "Free Money Sénégal" },
            ],
            CM: [
                { id: "cm.mtn", name: "MTN Mobile Money" },
                { id: "cm.orange", name: "Orange Money Cameroun" },
            ],
            CI: [
                { id: "ci.mtn", name: "MTN CI" },
                { id: "ci.orange", name: "Orange Money CI" },
                { id: "ci.wave", name: "Wave CI" },
                { id: "ci.moov", name: "Moov Money CI" },
            ],
            GA: [
                { id: "ga.airtel", name: "Airtel Money Gabon" },
            ],
        };
        return channels[countryCode.toUpperCase()] || [];
    }
    // ── WEBHOOK : Vérifier et parser ──────────────────────────────
    verifyWebhook(body, signature) {
        const crypto = require("crypto");
        const hash = crypto
            .createHmac("sha256", this.config.hashKey)
            .update(JSON.stringify(body))
            .digest("hex");
        return hash === signature;
    }
    parseWebhook(body) {
        return {
            type: body.event,
            reference: body.data?.reference || body.reference,
            status: body.data?.status || body.status,
            amount: body.data?.amount || 0,
            currency: body.data?.currency || "XAF",
        };
    }
}
exports.NotchpayService = NotchpayService;
// ── INSTANCE SINGLETON ────────────────────────────────────────
exports.notchpay = new NotchpayService({
    publicKey: process.env.NOTCHPAY_PUBLIC_KEY || "",
    privateKey: process.env.NOTCHPAY_PRIVATE_KEY || "",
    hashKey: process.env.NOTCHPAY_HASH_KEY || "",
    callbackUrl: process.env.NOTCHPAY_CALLBACK_URL || "http://localhost:3000/payment/success",
    notifyUrl: process.env.NOTCHPAY_NOTIFY_URL || "http://localhost:4000/api/webhooks/notchpay",
});
//# sourceMappingURL=notchpay.service.js.map