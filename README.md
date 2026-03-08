# Wallet API

Backend API permettant de gérer un système de wallet numérique avec :

- authentification JWT
- wallet par utilisateur
- dépôts
- retraits
- transferts avec frais
- historique des transactions
- limite journalière
- idempotency pour éviter les doubles transactions

---

# Stack technique

- Node.js
- Express
- TypeScript
- Prisma ORM
- PostgreSQL
- JWT
- Zod
- Jest
- Postman

---

# Fonctionnalités

## Authentification

- Register
- Login
- JWT Authentication
- Middleware `requireAuth`

---

## Wallet

Chaque utilisateur possède un wallet contenant :

- currency
- balance
- historique des transactions

---

## Transactions

### Deposit
