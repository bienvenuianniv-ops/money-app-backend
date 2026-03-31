"use strict";
// src/services/payment-providers/paytech.service.ts
// PayTech — Sénégal, Afrique de l'Ouest
// Docs : https://paytech.sn
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.paytech = exports.PayTechService = void 0;
const axios_1 = __importDefault(require("axios"));
const PAYTECH_BASE = "https://paytech.sn";
class PayTechService {
    constructor(config) {
        this.config = config;
    }
    get headers() {
        return {
            "API_KEY": this.config.apiKey,
            "API_SECRET": this.config.secretKey,
            "Content-Type": "application/json",
        };
    }
    // ── DÉPÔT : Initier un paiement ──────────────────────────────
    async initiateDeposit(params) {
        const payload = {
            item_name: params.itemName,
            item_price: params.itemPrice,
            currency: params.currency,
            ref_command: params.reference,
            command_name: params.itemName,
            env: "prod",
            success_url: this.config.successUrl,
            cancel_url: this.config.cancelUrl,
            ipn_url: this.config.ipnUrl,
            custom_field: params.customField || JSON.stringify({ reference: params.reference }),
        };
        console.log("[PAYTECH PAYLOAD]", JSON.stringify(payload));
        let response;
        try {
            response = await axios_1.default.post(`${PAYTECH_BASE}/api/payment/request-payment`, payload, { headers: this.headers });
        }
        catch (err) {
            console.error("[PAYTECH ERROR]", JSON.stringify(err?.response?.data));
            throw new Error(err?.response?.data?.message || err.message);
        }
        const data = response.data;
        console.log("[PAYTECH RESPONSE]", JSON.stringify(data));
        if (!data.success || data.success !== 1) {
            throw new Error(`PayTech erreur: ${JSON.stringify(data)}`);
        }
        return {
            reference: params.reference,
            redirectUrl: `${PAYTECH_BASE}/payment/checkout/${data.token}`,
            token: data.token,
            status: "pending",
            raw: data,
        };
    }
    // ── VÉRIFICATION DU STATUT ────────────────────────────────────
    async checkPaymentStatus(token) {
        const response = await axios_1.default.get(`${PAYTECH_BASE}/api/payment/check-payment-status/${token}`, { headers: this.headers });
        const data = response.data;
        return {
            status: data.status || "pending",
            amount: data.amount || 0,
            currency: data.currency || "XOF",
            raw: data,
        };
    }
    // ── WEBHOOK : Vérifier et parser ──────────────────────────────
    verifyWebhook(body) {
        // PayTech envoie les données IPN par POST
        return body && body.type_event === "sale_complete";
    }
    parseWebhook(body) {
        return {
            reference: body.ref_command || "",
            status: body.type_event === "sale_complete" ? "complete" : "failed",
            amount: parseInt(body.item_price) || 0,
            currency: body.currency || "XOF",
            token: body.token || "",
        };
    }
}
exports.PayTechService = PayTechService;
// ── INSTANCE SINGLETON ────────────────────────────────────────
exports.paytech = new PayTechService({
    apiKey: process.env.PAYTECH_API_KEY || "",
    secretKey: process.env.PAYTECH_SECRET_KEY || "",
    successUrl: process.env.PAYTECH_SUCCESS_URL || "https://mayouservice.com/pay/app.html",
    cancelUrl: process.env.PAYTECH_CANCEL_URL || "https://mayouservice.com/pay/app.html",
    ipnUrl: process.env.PAYTECH_IPN_URL || "https://paywest-backend.onrender.com/api/webhooks/paytech",
});
//# sourceMappingURL=paytech.service.js.map