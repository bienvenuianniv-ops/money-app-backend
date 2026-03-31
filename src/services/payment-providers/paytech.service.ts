// src/services/payment-providers/paytech.service.ts
// PayTech — Sénégal, Afrique de l'Ouest
// Docs : https://paytech.sn

import axios from "axios";

const PAYTECH_BASE = "https://paytech.sn";

export interface PayTechConfig {
  apiKey:    string;
  secretKey: string;
  successUrl: string;
  cancelUrl:  string;
  ipnUrl:     string;
}

export interface PayTechPaymentResult {
  reference:   string;
  redirectUrl: string;
  token:       string;
  status:      string;
  raw:         any;
}

export class PayTechService {
  private config: PayTechConfig;

  constructor(config: PayTechConfig) {
    this.config = config;
  }

  private get headers() {
    return {
      "API_KEY":      this.config.apiKey,
      "API_SECRET":   this.config.secretKey,
      "Content-Type": "application/json",
    };
  }

  // ── DÉPÔT : Initier un paiement ──────────────────────────────

  async initiateDeposit(params: {
    amount:        number;
    currency:      string;
    itemName:      string;
    itemPrice:     number;
    reference:     string;
    customerName?: string;
    customField?:  string;
  }): Promise<PayTechPaymentResult> {

    const payload = {
      item_name:     params.itemName,
      item_price:    params.itemPrice,
      currency:      params.currency,
      ref_command:   params.reference,
      command_name:  params.itemName,
      env:           "prod",
      success_url:   this.config.successUrl,
      cancel_url:    this.config.cancelUrl,
      ipn_url:       this.config.ipnUrl,
      custom_field:  params.customField || JSON.stringify({ reference: params.reference }),
      // Nom du client requis par PayTech
      customer_fullname: params.customerName || "Client PayWest",
    };

    console.log("[PAYTECH PAYLOAD]", JSON.stringify(payload));

    let response;
    try {
      response = await axios.post(
        `${PAYTECH_BASE}/api/payment/request-payment`,
        payload,
        { headers: this.headers }
      );
    } catch (err: any) {
      console.error("[PAYTECH ERROR]", JSON.stringify(err?.response?.data));
      throw new Error(err?.response?.data?.message || err.message);
    }

    const data = response.data;
    console.log("[PAYTECH RESPONSE]", JSON.stringify(data));

    if (!data.success || data.success !== 1) {
      throw new Error(`PayTech erreur: ${JSON.stringify(data)}`);
    }

    return {
      reference:   params.reference,
      redirectUrl: `${PAYTECH_BASE}/payment/checkout/${data.token}`,
      token:       data.token,
      status:      "pending",
      raw:         data,
    };
  }

  // ── VÉRIFICATION DU STATUT ────────────────────────────────────

  async checkPaymentStatus(token: string): Promise<{
    status:   string;
    amount:   number;
    currency: string;
    raw:      any;
  }> {
    const response = await axios.get(
      `${PAYTECH_BASE}/api/payment/check-payment-status/${token}`,
      { headers: this.headers }
    );

    const data = response.data;

    return {
      status:   data.status || "pending",
      amount:   data.amount || 0,
      currency: data.currency || "XOF",
      raw:      data,
    };
  }

  // ── WEBHOOK : Vérifier et parser ──────────────────────────────

  verifyWebhook(body: any): boolean {
    return body && body.type_event === "sale_complete";
  }

  parseWebhook(body: any): {
    reference: string;
    status:    string;
    amount:    number;
    currency:  string;
    token:     string;
  } {
    return {
      reference: body.ref_command || "",
      status:    body.type_event === "sale_complete" ? "complete" : "failed",
      amount:    parseInt(body.item_price) || 0,
      currency:  body.currency || "XOF",
      token:     body.token || "",
    };
  }
}

// ── INSTANCE SINGLETON ────────────────────────────────────────

export const paytech = new PayTechService({
  apiKey:     process.env.PAYTECH_API_KEY    || "",
  secretKey:  process.env.PAYTECH_SECRET_KEY || "",
  successUrl: process.env.PAYTECH_SUCCESS_URL || "https://mayouservice.com/pay/app.html",
  cancelUrl:  process.env.PAYTECH_CANCEL_URL  || "https://mayouservice.com/pay/app.html",
  ipnUrl:     process.env.PAYTECH_IPN_URL     || "https://paywest-backend.onrender.com/api/webhooks/paytech",
});
