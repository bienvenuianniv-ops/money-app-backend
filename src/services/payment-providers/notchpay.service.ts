// src/services/payment-providers/notchpay.service.ts
// Notchpay — Sénégal, Cameroun, Côte d'Ivoire et plus
// Docs : https://developer.notchpay.co

import axios from "axios";

const NOTCHPAY_BASE = "https://api.notchpay.co";

export interface NotchpayConfig {
  publicKey:   string;
  privateKey:  string;
  hashKey:     string;
  callbackUrl: string;
  notifyUrl:   string;
}

export interface NotchpayPaymentResult {
  reference:        string;
  authorizationUrl: string;
  status:           string;
  raw:              any;
}

export interface NotchpayTransferResult {
  success:   boolean;
  reference: string;
  message:   string;
  raw:       any;
}

export class NotchpayService {
  private config: NotchpayConfig;

  constructor(config: NotchpayConfig) {
    this.config = config;
  }

  private get headers() {
    return {
      Authorization: this.config.publicKey,
      "Content-Type": "application/json",
    };
  }

  private get privateHeaders() {
    return {
      Authorization: this.config.privateKey,
      "Content-Type": "application/json",
    };
  }

  // ── DÉPÔT : Initier un paiement ──────────────────────────────

  async initiateDeposit(params: {
    amount:      number;
    currency:    string;
    email:       string;
    phone:       string;
    name:        string;
    reference:   string;
    description: string;
  }): Promise<NotchpayPaymentResult> {
    const payload = {
      amount:      params.amount,
      currency:    params.currency,
      email:       params.email,
      phone:       params.phone,
      name:        params.name,
      reference:   params.reference,
      description: params.description,
      callback:    this.config.callbackUrl,
    };

    console.log("[NOTCHPAY PAYLOAD]", JSON.stringify(payload));

    let response;
    try {
      response = await axios.post(
        `${NOTCHPAY_BASE}/payments/initialize`,
        payload,
        { headers: this.headers }
      );
    } catch (err: any) {
      console.error("[NOTCHPAY ERROR]", JSON.stringify(err?.response?.data));
      throw new Error(err?.response?.data?.message || err.message);
    }

    const data = response.data;

    if (!data.authorization_url && !data.transaction?.authorization_url) {
      throw new Error(`Notchpay erreur: ${JSON.stringify(data)}`);
    }

    return {
      reference:        data.transaction?.reference || params.reference,
      authorizationUrl: data.authorization_url || data.transaction?.authorization_url,
      status:           data.transaction?.status || "pending",
      raw:              data,
    };
  }

  // ── VÉRIFICATION DU STATUT ────────────────────────────────────

  async checkPaymentStatus(reference: string): Promise<{
    status:   "pending" | "complete" | "failed" | "canceled";
    amount:   number;
    currency: string;
    raw:      any;
  }> {
    const response = await axios.get(
      `${NOTCHPAY_BASE}/payments/${reference}`,
      { headers: this.headers }
    );

    const data = response.data;
    const tx   = data.transaction || data;

    return {
      status:   tx.status,
      amount:   tx.amount || 0,
      currency: tx.currency || "XAF",
      raw:      data,
    };
  }

  // ── RETRAIT (TRANSFER) ────────────────────────────────────────

  async initiateWithdraw(params: {
    amount:       number;
    currency:     string;
    phone:        string;
    channel:      string;
    name:         string;
    email?:       string;
    reference:    string;
    description?: string;
  }): Promise<NotchpayTransferResult> {
    const payload = {
      amount:      params.amount,
      currency:    params.currency,
      destination: params.phone,
      channel:     params.channel,
      description: params.description || "Retrait PayWest",
      reference:   params.reference,
      beneficiary: {
        name:  params.name,
        email: params.email || `${params.phone}@paywest.app`,
        phone: params.phone,
      },
    };

    try {
      const response = await axios.post(
        `${NOTCHPAY_BASE}/transfers`,
        payload,
        { headers: this.privateHeaders }
      );

      const data = response.data;

      return {
        success:   data.status === "sent" || data.status === "pending",
        reference: data.transfer?.reference || params.reference,
        message:   data.message || "Retrait initié",
        raw:       data,
      };
    } catch (error: any) {
      return {
        success:   false,
        reference: params.reference,
        message:   error?.response?.data?.message || error.message || "Erreur retrait",
        raw:       error?.response?.data,
      };
    }
  }

  // ── CANAUX DISPONIBLES PAR PAYS ───────────────────────────────

  static getChannels(countryCode: string): { id: string; name: string }[] {
    const channels: Record<string, { id: string; name: string }[]> = {
      SN: [
        { id: "sn.wave",   name: "Wave Sénégal" },
        { id: "sn.orange", name: "Orange Money Sénégal" },
        { id: "sn.free",   name: "Free Money Sénégal" },
      ],
      CM: [
        { id: "cm.mtn",    name: "MTN Mobile Money" },
        { id: "cm.orange", name: "Orange Money Cameroun" },
      ],
      CI: [
        { id: "ci.mtn",    name: "MTN CI" },
        { id: "ci.orange", name: "Orange Money CI" },
        { id: "ci.wave",   name: "Wave CI" },
        { id: "ci.moov",   name: "Moov Money CI" },
      ],
      GA: [
        { id: "ga.airtel", name: "Airtel Money Gabon" },
      ],
    };
    return channels[countryCode.toUpperCase()] || [];
  }

  // ── WEBHOOK : Vérifier et parser ──────────────────────────────

  verifyWebhook(body: any, signature: string): boolean {
    const crypto = require("crypto");
    const hash = crypto
      .createHmac("sha256", this.config.hashKey)
      .update(JSON.stringify(body))
      .digest("hex");
    return hash === signature;
  }

  parseWebhook(body: any): {
    type:      string;
    reference: string;
    status:    string;
    amount:    number;
    currency:  string;
  } {
    return {
      type:      body.event,
      reference: body.data?.reference || body.reference,
      status:    body.data?.status    || body.status,
      amount:    body.data?.amount    || 0,
      currency:  body.data?.currency  || "XAF",
    };
  }
}

// ── INSTANCE SINGLETON ────────────────────────────────────────

export const notchpay = new NotchpayService({
  publicKey:   process.env.NOTCHPAY_PUBLIC_KEY   || "",
  privateKey:  process.env.NOTCHPAY_PRIVATE_KEY  || "",
  hashKey:     process.env.NOTCHPAY_HASH_KEY      || "",
  callbackUrl: process.env.NOTCHPAY_CALLBACK_URL || "http://localhost:3000/payment/success",
  notifyUrl:   process.env.NOTCHPAY_NOTIFY_URL   || "http://localhost:4000/api/webhooks/notchpay",
});
