"use strict";
// src/services/payment-providers/paydunya.service.ts
// PayDunya — Sénégal (Wave, Orange Money, Free Money)
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.paydunya = exports.PayDunyaService = void 0;
const axios_1 = __importDefault(require("axios"));
const PAYDUNYA_BASE = "https://app.paydunya.com/api/v1"; // Production
class PayDunyaService {
    get headers() {
        return {
            "PAYDUNYA-MASTER-KEY": process.env.PAYDUNYA_MASTER_KEY || "",
            "PAYDUNYA-PUBLIC-KEY": process.env.PAYDUNYA_PUBLIC_KEY || "",
            "PAYDUNYA-PRIVATE-KEY": process.env.PAYDUNYA_PRIVATE_KEY || "",
            "PAYDUNYA-TOKEN": process.env.PAYDUNYA_TOKEN || "",
            "Content-Type": "application/json",
        };
    }
    // ── DÉPÔT : Créer une facture de paiement ──────────────────
    async initiateDeposit(params) {
        const payload = {
            invoice: {
                total_amount: params.amount,
                description: params.description,
            },
            store: {
                name: "PayWest",
                website: "https://mayouservice.com/pay/app.html",
            },
            actions: {
                cancel_url: params.cancelUrl,
                return_url: params.returnUrl,
                callback_url: params.ipnUrl,
            },
            custom_data: {
                reference: params.reference,
                customerName: params.customerName,
            },
        };
        console.log("[PAYDUNYA PAYLOAD]", JSON.stringify(payload));
        let response;
        try {
            response = await axios_1.default.post(`${PAYDUNYA_BASE}/checkout-invoice/create`, payload, { headers: this.headers });
        }
        catch (err) {
            console.error("[PAYDUNYA ERROR]", JSON.stringify(err?.response?.data));
            throw new Error(err?.response?.data?.message || err.message);
        }
        const data = response.data;
        console.log("[PAYDUNYA RESPONSE]", JSON.stringify(data));
        if (data.response_code !== "00") {
            throw new Error(`PayDunya erreur: ${JSON.stringify(data)}`);
        }
        return {
            token: data.token,
            redirectUrl: data.response_text,
            reference: params.reference,
            status: "pending",
            raw: data,
        };
    }
    // ── VÉRIFICATION DU STATUT ────────────────────────────────
    async checkPaymentStatus(token) {
        const response = await axios_1.default.get(`${PAYDUNYA_BASE}/checkout-invoice/confirm/${token}`, { headers: this.headers });
        const data = response.data;
        const status = data.status === "completed" ? "complete" : data.status;
        return {
            status,
            amount: data.invoice?.total_amount || 0,
            currency: "XOF",
            raw: data,
        };
    }
    // ── WEBHOOK IPN ───────────────────────────────────────────
    parseWebhook(body) {
        return {
            reference: body.custom_data?.reference || "",
            status: body.status === "completed" ? "complete" : "failed",
            amount: parseInt(body.invoice?.total_amount) || 0,
            currency: "XOF",
            token: body.token || "",
        };
    }
}
exports.PayDunyaService = PayDunyaService;
// ── INSTANCE SINGLETON ────────────────────────────────────
exports.paydunya = new PayDunyaService();
//# sourceMappingURL=paydunya.service.js.map