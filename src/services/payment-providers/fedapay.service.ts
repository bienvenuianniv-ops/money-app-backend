// src/services/payment-providers/fedapay.service.ts
// FedaPay — Sénégal, Bénin, Côte d'Ivoire, Togo, Guinée
// Docs : https://docs.fedapay.com

import axios from "axios";

const FEDAPAY_BASE_LIVE    = "https://api.fedapay.com/v1";
const FEDAPAY_BASE_SANDBOX = "https://sandbox-api.fedapay.com/v1";

export interface FedaPayConfig {
  secretKey:   string;
  publicKey:   string;
  environment: "live" | "sandbox";
  callbackUrl: string;
  notifyUrl:   string;
}

export interface FedaPayTransactionResult {
  id:          number;
  reference:   string;
  paymentUrl:  string;
  status:      string;
  amount:      number;
  currency:    string;
  raw:         any;
}

export interface FedaPayPayoutResult {
  success:    boolean;
  reference:  string;
  message:    string;
  raw:        any;
}

export class FedaPayService {
  private config: FedaPayConfig;

  constructor(config: FedaPayConfig) {
    this.config = config;
  }

  private get baseUrl(): string {
    return this.config.environment === "live"
      ? FEDAPAY_BASE_LIVE
      : FEDAPAY_BASE_SANDBOX;
  }

  private get headers() {
    return {
      Authorization: this.config.secretKey,
      "Content-Type": "application/json",
    };
  }

  // ── DÉPÔT : Créer une transaction ────────────────────────────

  async initiateDeposit(params: {
    amount:      number;
    currency:    string;
    description: string;
    firstName:   string;
    lastName:    string;
    email:       string;
    phone:       string;
    reference:   string;
  }): Promise<FedaPayTransactionResult> {
    const payload = {
      description:  params.description,
      amount:       params.amount,
      currency:     { iso: params.currency },
      callback_url: this.config.callbackUrl,
      customer: {
        firstname: params.firstName,
        lastname:  params.lastName,
        email:     params.email,
        phone_number: {
          number:  params.phone,
          country: "SN",
        },
      },
    };

    console.log("FedaPay URL:", this.baseUrl);
    console.log("FedaPay KEY:", this.config.secretKey?.slice(0, 20));

    let response;
    try {
      response = await axios.post(
        `${this.baseUrl}/transactions`,
        payload,
        { headers: this.headers }
      );
    } catch (err: any) {
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
      tokenRes = await axios.post(
        `${this.baseUrl}/transactions/${tx.id}/token`,
        {},
        { headers: this.headers }
      );
    } catch (err: any) {
      console.log("TOKEN ERROR:", JSON.stringify(err?.response?.data));
      throw err;
    }

    console.log("TOKEN RESPONSE:", JSON.stringify(tokenRes.data).slice(0, 200));

    const token      = tokenRes.data.token;
    const paymentUrl = tokenRes.data?.url || tokenRes.data?.payment_url || `https://checkout.fedapay.com/pay/${token}`;
console.log("PAYMENT URL FINAL:", paymentUrl);

    return {
      id:         tx.id,
      reference:  params.reference,
      paymentUrl,
      status:     tx.status,
      amount:     params.amount,
      currency:   params.currency,
      raw:        tx,
    };
  }

  // ── VÉRIFICATION DU STATUT ────────────────────────────────────

  async checkTransactionStatus(transactionId: number): Promise<{
    status:   string;
    amount:   number;
    currency: string;
    raw:      any;
  }> {
    const response = await axios.get(
      `${this.baseUrl}/transactions/${transactionId}`,
      { headers: this.headers }
    );

  console.log("STATUS RESPONSE:", JSON.stringify(response.data).slice(0, 200));
const tx = response.data["v1/transaction"]
        || response.data.v1_transaction
        || response.data.transaction
        || response.data;
    return {
      status:   tx.status,
      amount:   tx.amount,
      currency: tx.currency?.iso || "XOF",
      raw:      tx,
    };
  }

  // ── RETRAIT (PAYOUT) ──────────────────────────────────────────

  async initiateWithdraw(params: {
    amount:    number;
    currency:  string;
    phone:     string;
    firstName: string;
    lastName:  string;
    email:     string;
    reference: string;
  }): Promise<FedaPayPayoutResult> {
    try {
      const payload = {
        amount:   params.amount,
        currency: { iso: params.currency },
        customer: {
          firstname: params.firstName,
          lastname:  params.lastName,
          email:     params.email,
          phone_number: {
            number:  params.phone,
            country: "SN",
          },
        },
        mode: "mtn-benin",
      };

      const response = await axios.post(
        `${this.baseUrl}/payouts`,
        payload,
        { headers: this.headers }
      );

      const payout = response.data.v1_payout
                  || response.data.payout
                  || response.data;

      return {
        success:   true,
        reference: params.reference,
        message:   "Retrait initié avec succès",
        raw:       payout,
      };
    } catch (error: any) {
      return {
        success:   false,
        reference: params.reference,
        message:   error?.response?.data?.message || error.message,
        raw:       error?.response?.data,
      };
    }
  }

  // ── WEBHOOK : Parser la notification ─────────────────────────

  parseWebhook(body: any): {
    type:     string;
    id:       number;
    status:   string;
    amount:   number;
    currency: string;
  } {
    return {
      type:     body.name,
      id:       body.entity?.id,
      status:   body.entity?.status,
      amount:   body.entity?.amount,
      currency: body.entity?.currency?.iso || "XOF",
    };
  }

  // ── MOYENS DE PAIEMENT DISPONIBLES ───────────────────────────

  static getPaymentMethods(countryCode: string): { id: string; name: string }[] {
    const methods: Record<string, { id: string; name: string }[]> = {
      SN: [
        { id: "wave-ci",         name: "Wave Sénégal" },
        { id: "orange-money-ci", name: "Orange Money Sénégal" },
        { id: "free-money-sn",   name: "Free Money Sénégal" },
      ],
      CI: [
        { id: "wave-ci",         name: "Wave CI" },
        { id: "orange-money-ci", name: "Orange Money CI" },
        { id: "mtn-ci",          name: "MTN CI" },
        { id: "moov-ci",         name: "Moov Money CI" },
      ],
      BJ: [
        { id: "mtn-benin",  name: "MTN Bénin" },
        { id: "moov-benin", name: "Moov Bénin" },
      ],
      TG: [
        { id: "flooz-tg",   name: "Flooz Togo" },
        { id: "tmoney-tg",  name: "T-Money Togo" },
      ],
      GN: [
        { id: "orange-money-gn", name: "Orange Money Guinée" },
      ],
    };
    return methods[countryCode.toUpperCase()] || [];
  }
}

// ── INSTANCE SINGLETON ────────────────────────────────────────

const cleanKey = (process.env.FEDAPAY_SECRET_KEY || "").trim();
console.log("ENV CHECK:", cleanKey?.slice(0, 15));

export const fedapay = new FedaPayService({
  secretKey:   cleanKey,
  publicKey:   (process.env.FEDAPAY_PUBLIC_KEY || "").trim(),
  environment: (process.env.FEDAPAY_ENV as "live" | "sandbox") || "live",
  callbackUrl: process.env.FEDAPAY_CALLBACK_URL || "http://localhost:3000/payment/success",
  notifyUrl:   process.env.FEDAPAY_NOTIFY_URL   || "http://localhost:4000/api/webhooks/fedapay",
});
