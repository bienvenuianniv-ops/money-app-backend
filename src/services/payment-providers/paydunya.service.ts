// src/services/payment-providers/paydunya.service.ts
// PayDunya — Sénégal (Wave, Orange Money, Free Money)

import axios from "axios";

const PAYDUNYA_BASE = "https://app.paydunya.com/api/v1"; // Production

export class PayDunyaService {

  private get headers() {
    return {
      "PAYDUNYA-MASTER-KEY":  process.env.PAYDUNYA_MASTER_KEY  || "",
      "PAYDUNYA-PUBLIC-KEY":  process.env.PAYDUNYA_PUBLIC_KEY  || "",
      "PAYDUNYA-PRIVATE-KEY": process.env.PAYDUNYA_PRIVATE_KEY || "",
      "PAYDUNYA-TOKEN":       process.env.PAYDUNYA_TOKEN       || "",
      "Content-Type":         "application/json",
    };
  }

  // ── DÉPÔT : Créer une facture de paiement ──────────────────

  async initiateDeposit(params: {
    amount:       number;
    currency:     string;
    description:  string;
    reference:    string;
    customerName: string;
    returnUrl:    string;
    cancelUrl:    string;
    ipnUrl:       string;
  }): Promise<{
    token:       string;
    redirectUrl: string;
    reference:   string;
    status:      string;
    raw:         any;
  }> {

    const payload = {
      invoice: {
        total_amount: params.amount,
        description:  params.description,
      },
      store: {
        name:    "PayWest",
        website: "https://mayouservice.com/pay/app.html",
      },
      actions: {
        cancel_url:   params.cancelUrl,
        return_url:   params.returnUrl,
        callback_url: params.ipnUrl,
      },
      custom_data: {
        reference:    params.reference,
        customerName: params.customerName,
      },
    };

    console.log("[PAYDUNYA PAYLOAD]", JSON.stringify(payload));

    let response;
    try {
      response = await axios.post(
        `${PAYDUNYA_BASE}/checkout-invoice/create`,
        payload,
        { headers: this.headers }
      );
    } catch (err: any) {
      console.error("[PAYDUNYA ERROR]", JSON.stringify(err?.response?.data));
      throw new Error(err?.response?.data?.message || err.message);
    }

    const data = response.data;
    console.log("[PAYDUNYA RESPONSE]", JSON.stringify(data));

    if (data.response_code !== "00") {
      throw new Error(`PayDunya erreur: ${JSON.stringify(data)}`);
    }

    return {
      token:       data.token,
      redirectUrl: data.response_text,
      reference:   params.reference,
      status:      "pending",
      raw:         data,
    };
  }

  // ── VÉRIFICATION DU STATUT ────────────────────────────────

  async checkPaymentStatus(token: string): Promise<{
    status:   string;
    amount:   number;
    currency: string;
    raw:      any;
  }> {
    const response = await axios.get(
      `${PAYDUNYA_BASE}/checkout-invoice/confirm/${token}`,
      { headers: this.headers }
    );

    const data = response.data;
    const status = data.status === "completed" ? "complete" : data.status;

    return {
      status,
      amount:   data.invoice?.total_amount || 0,
      currency: "XOF",
      raw:      data,
    };
  }

  // ── DÉBOURSEMENT : Envoyer vers Mobile Money ─────────────

  async sendMoney(params: {
    amount:    number;
    phone:     string;
    operator:  string;
    name:      string;
    reference: string;
    note:      string;
  }): Promise<{
    status:    string;
    reference: string;
    raw:       any;
  }> {

    const payload = {
      send_money: [
        {
          amount:       params.amount,
          phone_number: params.phone,
          operator:     params.operator,
          first_name:   params.name,
          last_name:    "",
        }
      ],
      amount:    params.amount,
      reference: params.reference,
    };

    console.log("[PAYDUNYA SEND_MONEY PAYLOAD]", JSON.stringify(payload));

    let response;
    try {
      response = await axios.post(
        `${PAYDUNYA_BASE}/disburse/get-status`,
        payload,
        { headers: this.headers }
      );
    } catch (err: any) {
      // Essayer l'endpoint de déboursement direct
      try {
        response = await axios.post(
          `${PAYDUNYA_BASE}/disburse`,
          payload,
          { headers: this.headers }
        );
      } catch (err2: any) {
        console.error("[PAYDUNYA SEND_MONEY ERROR]", JSON.stringify(err2?.response?.data));
        throw new Error(err2?.response?.data?.message || err2.message);
      }
    }

    const data = response.data;
    console.log("[PAYDUNYA SEND_MONEY RESPONSE]", JSON.stringify(data));

    return {
      status:    data.response_code === "00" ? "success" : "failed",
      reference: params.reference,
      raw:       data,
    };
  }

  // ── WEBHOOK IPN ───────────────────────────────────────────

  parseWebhook(body: any): {
    reference: string;
    status:    string;
    amount:    number;
    currency:  string;
    token:     string;
  } {
    return {
      reference: body.custom_data?.reference || "",
      status:    body.status === "completed" ? "complete" : "failed",
      amount:    parseInt(body.invoice?.total_amount) || 0,
      currency:  "XOF",
      token:     body.token || "",
    };
  }
}

// ── INSTANCE SINGLETON ────────────────────────────────────

export const paydunya = new PayDunyaService();
