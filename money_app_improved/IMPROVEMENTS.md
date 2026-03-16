# 🚀 Améliorations money_app — Multi-pays & Multi-devises

## Fichiers modifiés / créés

### 📁 prisma/schema.prisma
**Améliorations :**
- `User` : ajout de `countryCode` (ISO), `dialCode`, enums typés (`UserRole`, `UserStatus`)
- `Wallet` : ajout de `isActive`
- `Transaction` : ajout de `fromCurrency`, `toCurrency`, `exchangeRate`, `convertedAmount`, `reference` (unique), `note`
- ✅ **Nouvelle table `ExchangeRate`** : cache des taux de change
- ✅ **Nouvelle table `Country`** : pays supportés

---

### 📁 src/config/countries.ts *(NOUVEAU)*
- 13 pays actifs (CEDEAO + CEMAC + Europe)
- Devises : XOF, XAF, EUR, GNF, GHS, NGN
- Helpers : `getCountryByCode()`, `isCountrySupported()`, `getActiveCountries()`

---

### 📁 src/services/exchange.service.ts *(NOUVEAU)*
- Taux de change avec **cache en base** (1h)
- Taux fixes de référence (XOF ↔ XAF ↔ EUR ↔ GNF...)
- Calcul des frais selon le corridor :
  - **Même devise** : 0.5%
  - **Inter-FCFA (XOF ↔ XAF)** : 0.5%
  - **Inter-continental** : 1.5%
- Endpoint de simulation de conversion

---

### 📁 src/services/transactions.service.ts
**Améliorations :**
- `transfer()` : conversion automatique multi-devises + frais dynamiques
- `deposit()` : dépôt dans n'importe quelle devise
- `withdraw()` : retrait avec frais
- `getMyWallets()` : tous les wallets (multi-devises)
- `getMyTransactions()` : pagination + filtres (currency, type) + direction (SENT/RECEIVED)
- Référence unique lisible : `TXN-20260313-XXXXX`

---

### 📁 src/services/auth.service.ts
**Améliorations :**
- `register()` : `countryCode` obligatoire → wallet créé dans la devise du pays
- Normalisation du numéro de téléphone (dialCode, 00XX → +XX)
- `getSupportedCountries()` : liste des pays disponibles
- Profil enrichi avec pays et wallets

---

### 📁 src/routes/auth.routes.ts
**Nouveaux endpoints :**
- `GET /api/auth/countries` — liste des pays supportés

---

### 📁 src/routes/transactions.routes.ts
**Nouveaux endpoints :**
- `GET /api/wallets` — tous les wallets de l'utilisateur
- `POST /api/transactions/deposit` — dépôt
- `POST /api/transactions/withdraw` — retrait
- `GET /api/transactions?page=1&limit=20&currency=XOF&type=TRANSFER`
- `GET /api/exchange/rates` — taux de change
- `GET /api/exchange/convert?from=XOF&to=EUR&amount=10000` — simulation

---

## 📋 Étapes pour appliquer

```bash
# 1. Remplacer les fichiers dans ton projet

# 2. Appliquer la migration SQL
psql -d ta_base -f prisma/migrations/multi_country/migration.sql

# 3. Régénérer le client Prisma
npx prisma generate

# 4. Relancer le serveur
npm run dev
```

## 🔜 Prochaines étapes suggérées
- [ ] Intégrer une vraie API de taux de change (ExchangeRate-API, Fixer.io)
- [ ] Ajouter un job CRON pour rafraîchir les taux automatiquement
- [ ] Interface admin pour gérer les pays et taux
- [ ] Intégration Mobile Money (Wave, Orange Money, CinetPay)
- [ ] Notifications SMS / WhatsApp après chaque transaction
- [ ] KYC (vérification d'identité) pour les montants élevés
