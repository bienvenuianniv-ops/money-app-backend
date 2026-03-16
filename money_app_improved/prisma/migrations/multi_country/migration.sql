-- Migration : support multi-pays et multi-devises
-- À placer dans prisma/migrations/YYYYMMDDHHMMSS_multi_country/migration.sql

-- 1. Ajout des colonnes pays sur la table User
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "countryCode" TEXT NOT NULL DEFAULT 'SN';
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "dialCode" TEXT NOT NULL DEFAULT '+221';

-- Mise à jour du type des enums (si tu utilises les strings, pas besoin de migration enum)
-- role : 'USER' | 'ADMIN' | 'SYSTEM'
-- status : 'ACTIVE' | 'SUSPENDED' | 'PENDING_VERIFICATION'

-- 2. Ajout de isActive sur Wallet
ALTER TABLE "Wallet" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT TRUE;

-- 3. Mise à jour de la table Transaction (nouvelles colonnes)
ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "fromCurrency" TEXT NOT NULL DEFAULT 'XOF';
ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "toCurrency" TEXT NOT NULL DEFAULT 'XOF';
ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "exchangeRate" DOUBLE PRECISION NOT NULL DEFAULT 1.0;
ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "convertedAmount" BIGINT NOT NULL DEFAULT 0;
ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "reference" TEXT;
ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "note" TEXT;

-- Rendre reference unique
CREATE UNIQUE INDEX IF NOT EXISTS "Transaction_reference_key" ON "Transaction"("reference");

-- Changement du type status de TEXT vers un enum custom (si souhaité)
-- Pour l'instant on garde TEXT pour compatibilité

-- 4. Nouvelle table ExchangeRate
CREATE TABLE IF NOT EXISTS "ExchangeRate" (
  "id"           TEXT NOT NULL,
  "fromCurrency" TEXT NOT NULL,
  "toCurrency"   TEXT NOT NULL,
  "rate"         DOUBLE PRECISION NOT NULL,
  "source"       TEXT NOT NULL DEFAULT 'MANUAL',
  "fetchedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ExchangeRate_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ExchangeRate_fromCurrency_toCurrency_idx" ON "ExchangeRate"("fromCurrency", "toCurrency");
CREATE INDEX IF NOT EXISTS "ExchangeRate_fetchedAt_idx" ON "ExchangeRate"("fetchedAt");

-- 5. Nouvelle table Country
CREATE TABLE IF NOT EXISTS "Country" (
  "code"       TEXT NOT NULL,
  "name"       TEXT NOT NULL,
  "dialCode"   TEXT NOT NULL,
  "currency"   TEXT NOT NULL,
  "isActive"   BOOLEAN NOT NULL DEFAULT TRUE,
  "region"     TEXT NOT NULL,
  CONSTRAINT "Country_pkey" PRIMARY KEY ("code")
);

CREATE INDEX IF NOT EXISTS "Country_currency_idx" ON "Country"("currency");
CREATE INDEX IF NOT EXISTS "Country_region_idx" ON "Country"("region");
CREATE INDEX IF NOT EXISTS "Country_isActive_idx" ON "Country"("isActive");

-- 6. Index supplémentaires sur User
CREATE INDEX IF NOT EXISTS "User_countryCode_idx" ON "User"("countryCode");
CREATE INDEX IF NOT EXISTS "User_status_idx" ON "User"("status");

-- 7. Index supplémentaires sur Transaction
CREATE INDEX IF NOT EXISTS "Transaction_status_idx" ON "Transaction"("status");
CREATE INDEX IF NOT EXISTS "Transaction_fromCurrency_idx" ON "Transaction"("fromCurrency");
CREATE INDEX IF NOT EXISTS "Transaction_toCurrency_idx" ON "Transaction"("toCurrency");

-- 8. Seed des pays actifs
INSERT INTO "Country" ("code", "name", "dialCode", "currency", "isActive", "region") VALUES
  ('SN', 'Sénégal',       '+221', 'XOF', true,  'CEDEAO'),
  ('CI', 'Côte d''Ivoire', '+225', 'XOF', true,  'CEDEAO'),
  ('ML', 'Mali',           '+223', 'XOF', true,  'CEDEAO'),
  ('BF', 'Burkina Faso',   '+226', 'XOF', true,  'CEDEAO'),
  ('TG', 'Togo',           '+228', 'XOF', true,  'CEDEAO'),
  ('BJ', 'Bénin',          '+229', 'XOF', true,  'CEDEAO'),
  ('NE', 'Niger',          '+227', 'XOF', true,  'CEDEAO'),
  ('GN', 'Guinée',         '+224', 'GNF', true,  'CEDEAO'),
  ('CM', 'Cameroun',       '+237', 'XAF', true,  'CEMAC'),
  ('GA', 'Gabon',          '+241', 'XAF', true,  'CEMAC'),
  ('CG', 'Congo',          '+242', 'XAF', true,  'CEMAC'),
  ('FR', 'France',         '+33',  'EUR', true,  'EUROPE'),
  ('BE', 'Belgique',       '+32',  'EUR', true,  'EUROPE')
ON CONFLICT ("code") DO NOTHING;
