"use strict";
// src/services/payment-providers/fedapay.service.ts
// FedaPay — Sénégal, Bénin, Côte d'Ivoire, Togo, Guinée
// Docs : https://docs.fedapay.com
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fedapay = exports.FedaPayService = void 0;
const axios_1 = __importDefault(require("axios"));
const FEDAPAY_BASE_LIVE = "https://api.fedapay.com/v1";
const FEDAPAY_BASE_SANDBOX = "https://sandbox-api.fedapay.com/v1";
class FedaPayService {
    constructor(config) {
        this.config = config;
    }
    get baseUrl() {
        return this.config.environment === "live"
            ? FEDAPAY_BASE_LIVE
            : FEDAPAY_BASE_SANDBOX;
    }
    get headers() {
        return {
            Authorization: this.config.secretKey,
            "Content-Type": "application/json",
        };
    }
    // ── DÉPÔT : Créer une transaction ────────────────────────────
    async initiateDeposit(params) {
        const payload = {
            description: params.description,
            amount: params.amount,
            currency: { iso: params.currency },
            callback_url: this.config.callbackUrl,
            customer: {
                firstname: params.firstName,
                lastname: params.lastName,
                email: params.email,
                phone_number: {
                    number: params.phone,
                    country: "SN",
                },
            },
        };
        console.log("FedaPay URL:", this.baseUrl);
        console.log("FedaPay KEY:", this.config.secretKey?.slice(0, 20));
        let response;
        try {
            response = await axios_1.default.post(`${this.baseUrl}/transactions`, payload, { headers: this.headers });
        }
        catch (err) {
            console.log("FEDAPAY RAW ERROR:", JSON.stringify(err?.response?.data));
            console.log("FEDAPAY STATUS:", err?.response?.status);
            throw err;
        }
        console.log("FEDAPAY RESPONSE:", JSON.stringify(response.data).slice(0, 300));
        // FedaPay peut retourner la transaction dans différents formats
        const tx = response.data["v1/transaction"]
            || response.data.v1_transaction
            || response.data.transaction
            || response.data;
        console.log("TX ID:", tx?.id);
        console.log("TOKEN URL:", `${this.baseUrl}/transactions/${tx?.id}/token`);
        // Générer le lien de paiement
        let tokenRes;
        try {
            tokenRes = await axios_1.default.post(`${this.baseUrl}/transactions/${tx.id}/token`, {}, { headers: this.headers });
        }
        catch (err) {
            console.log("TOKEN ERROR:", JSON.stringify(err?.response?.data));
            throw err;
        }
        console.log("TOKEN RESPONSE:", JSON.stringify(tokenRes.data).slice(0, 200));
        const token = tokenRes.data.token;
        const paymentUrl = `https://checkout.fedapay.com/pay/${token}`;
        return {
            id: tx.id,
            reference: params.reference,
            paymentUrl,
            status: tx.status,
            amount: params.amount,
            currency: params.currency,
            raw: tx,
        };
    }
    // ── VÉRIFICATION DU STATUT ────────────────────────────────────
    async checkTransactionStatus(transactionId) {
        const response = await axios_1.default.get(`${this.baseUrl}/transactions/${transactionId}`, { headers: this.headers });
        console.log("STATUS RESPONSE:", JSON.stringify(response.data).slice(0, 200));
        const tx = response.data["v1/transaction"]
            || response.data.v1_transaction
            || response.data.transaction
            || response.data;
        return {
            status: tx.status,
            amount: tx.amount,
            currency: tx.currency?.iso || "XOF",
            raw: tx,
        };
    }
    // ── RETRAIT (PAYOUT) ──────────────────────────────────────────
    async initiateWithdraw(params) {
        try {
            const payload = {
                amount: params.amount,
                currency: { iso: params.currency },
                customer: {
                    firstname: params.firstName,
                    lastname: params.lastName,
                    email: params.email,
                    phone_number: {
                        number: params.phone,
                        country: "SN",
                    },
                },
                mode: "mtn-benin",
            };
            const response = await axios_1.default.post(`${this.baseUrl}/payouts`, payload, { headers: this.headers });
            const payout = response.data.v1_payout
                || response.data.payout
                || response.data;
            return {
                success: true,
                reference: params.reference,
                message: "Retrait initié avec succès",
                raw: payout,
            };
        }
        catch (error) {
            return {
                success: false,
                reference: params.reference,
                message: error?.response?.data?.message || error.message,
                raw: error?.response?.data,
            };
        }
    }
    // ── WEBHOOK : Parser la notification ─────────────────────────
    parseWebhook(body) {
        return {
            type: body.name,
            id: body.entity?.id,
            status: body.entity?.status,
            amount: body.entity?.amount,
            currency: body.entity?.currency?.iso || "XOF",
        };
    }
    // ── MOYENS DE PAIEMENT DISPONIBLES ───────────────────────────
    static getPaymentMethods(countryCode) {
        const methods = {
            SN: [
                { id: "wave-ci", name: "Wave Sénégal" },
                { id: "orange-money-ci", name: "Orange Money Sénégal" },
                { id: "free-money-sn", name: "Free Money Sénégal" },
            ],
            CI: [
                { id: "wave-ci", name: "Wave CI" },
                { id: "orange-money-ci", name: "Orange Money CI" },
                { id: "mtn-ci", name: "MTN CI" },
                { id: "moov-ci", name: "Moov Money CI" },
            ],
            BJ: [
                { id: "mtn-benin", name: "MTN Bénin" },
                { id: "moov-benin", name: "Moov Bénin" },
            ],
            TG: [
                { id: "flooz-tg", name: "Flooz Togo" },
                { id: "tmoney-tg", name: "T-Money Togo" },
            ],
            GN: [
                { id: "orange-money-gn", name: "Orange Money Guinée" },
            ],
        };
        return methods[countryCode.toUpperCase()] || [];
    }
}
exports.FedaPayService = FedaPayService;
// ── INSTANCE SINGLETON ────────────────────────────────────────
const cleanKey = (process.env.FEDAPAY_SECRET_KEY || "").trim();
console.log("ENV CHECK:", cleanKey?.slice(0, 15));
exports.fedapay = new FedaPayService({
    secretKey: cleanKey,
    publicKey: (process.env.FEDAPAY_PUBLIC_KEY || "").trim(),
    environment: process.env.FEDAPAY_ENV || "sandbox",
    callbackUrl: process.env.FEDAPAY_CALLBACK_URL || "http://localhost:3000/payment/success",
    notifyUrl: process.env.FEDAPAY_NOTIFY_URL || "http://localhost:4000/api/webhooks/fedapay",
});
//# sourceMappingURL=fedapay.service.js.map