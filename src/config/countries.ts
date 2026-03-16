// src/config/countries.ts
// Liste des pays supportés par la plateforme

export type CountryConfig = {
  code: string;       // ISO 3166-1 alpha-2
  name: string;
  dialCode: string;
  currency: string;
  region: "CEDEAO" | "CEMAC" | "EUROPE" | "AUTRE";
  isActive: boolean;
};

export const SUPPORTED_COUNTRIES: Record<string, CountryConfig> = {
  // ── CEDEAO (Zone XOF) ──────────────────────────
  SN: { code: "SN", name: "Sénégal",       dialCode: "+221", currency: "XOF", region: "CEDEAO", isActive: true },
  CI: { code: "CI", name: "Côte d'Ivoire", dialCode: "+225", currency: "XOF", region: "CEDEAO", isActive: true },
  ML: { code: "ML", name: "Mali",          dialCode: "+223", currency: "XOF", region: "CEDEAO", isActive: true },
  BF: { code: "BF", name: "Burkina Faso",  dialCode: "+226", currency: "XOF", region: "CEDEAO", isActive: true },
  TG: { code: "TG", name: "Togo",          dialCode: "+228", currency: "XOF", region: "CEDEAO", isActive: true },
  BJ: { code: "BJ", name: "Bénin",         dialCode: "+229", currency: "XOF", region: "CEDEAO", isActive: true },
  NE: { code: "NE", name: "Niger",         dialCode: "+227", currency: "XOF", region: "CEDEAO", isActive: true },
  GW: { code: "GW", name: "Guinée-Bissau", dialCode: "+245", currency: "XOF", region: "CEDEAO", isActive: true },
  GN: { code: "GN", name: "Guinée",        dialCode: "+224", currency: "GNF", region: "CEDEAO", isActive: true },
  GH: { code: "GH", name: "Ghana",         dialCode: "+233", currency: "GHS", region: "CEDEAO", isActive: false },
  NG: { code: "NG", name: "Nigeria",       dialCode: "+234", currency: "NGN", region: "CEDEAO", isActive: false },

  // ── CEMAC (Zone XAF) ───────────────────────────
  CM: { code: "CM", name: "Cameroun",             dialCode: "+237", currency: "XAF", region: "CEMAC", isActive: true },
  GA: { code: "GA", name: "Gabon",                dialCode: "+241", currency: "XAF", region: "CEMAC", isActive: true },
  CG: { code: "CG", name: "Congo",                dialCode: "+242", currency: "XAF", region: "CEMAC", isActive: true },
  CD: { code: "CD", name: "RD Congo",             dialCode: "+243", currency: "CDF", region: "CEMAC", isActive: false },
  CF: { code: "CF", name: "Centrafrique",         dialCode: "+236", currency: "XAF", region: "CEMAC", isActive: false },
  TD: { code: "TD", name: "Tchad",                dialCode: "+235", currency: "XAF", region: "CEMAC", isActive: false },
  GQ: { code: "GQ", name: "Guinée Équatoriale",   dialCode: "+240", currency: "XAF", region: "CEMAC", isActive: false },

  // ── EUROPE (Diaspora) ──────────────────────────
  FR: { code: "FR", name: "France",      dialCode: "+33",  currency: "EUR", region: "EUROPE", isActive: true },
  BE: { code: "BE", name: "Belgique",    dialCode: "+32",  currency: "EUR", region: "EUROPE", isActive: true },
  IT: { code: "IT", name: "Italie",      dialCode: "+39",  currency: "EUR", region: "EUROPE", isActive: false },
  ES: { code: "ES", name: "Espagne",     dialCode: "+34",  currency: "EUR", region: "EUROPE", isActive: false },
  PT: { code: "PT", name: "Portugal",    dialCode: "+351", currency: "EUR", region: "EUROPE", isActive: false },
};

// Devises supportées avec leur précision (en centimes/sous-unités)
export const CURRENCY_PRECISION: Record<string, number> = {
  XOF: 0,   // pas de centimes (FCFA)
  XAF: 0,   // pas de centimes (FCFA)
  EUR: 2,   // centimes
  GNF: 0,   // pas de centimes (Franc guinéen)
  GHS: 2,   // pesewas
  NGN: 2,   // kobo
  CDF: 2,   // centimes congolais
};

/**
 * Retourne le pays par son indicatif téléphonique
 */
export function getCountryByDialCode(dialCode: string): CountryConfig | null {
  return (
    Object.values(SUPPORTED_COUNTRIES).find(
      (c) => c.dialCode === dialCode && c.isActive
    ) ?? null
  );
}

/**
 * Retourne le pays par son code ISO
 */
export function getCountryByCode(code: string): CountryConfig | null {
  return SUPPORTED_COUNTRIES[code.toUpperCase()] ?? null;
}

/**
 * Retourne tous les pays actifs
 */
export function getActiveCountries(): CountryConfig[] {
  return Object.values(SUPPORTED_COUNTRIES).filter((c) => c.isActive);
}

/**
 * Vérifie si un pays est supporté et actif
 */
export function isCountrySupported(code: string): boolean {
  const country = SUPPORTED_COUNTRIES[code.toUpperCase()];
  return !!country && country.isActive;
}
