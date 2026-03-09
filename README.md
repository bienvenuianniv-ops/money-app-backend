# Wallet API

Backend API permettant de gérer un système de **wallet numérique** avec :

* authentification JWT
* wallet par utilisateur
* dépôts
* retraits
* transferts avec frais
* historique des transactions
* limite journalière
* idempotency pour éviter les doubles transactions

---

## Table of Contents

* [Stack technique](#stack-technique)
* [Fonctionnalités](#fonctionnalités)
* [Architecture](#architecture)
* [Database Design](#database-design)
* [API Endpoints](#api-endpoints)
* [API Examples](#api-examples)
* [Installation](#installation)
* [Tests](#tests)

---

# Stack technique

* Node.js
* Express
* TypeScript
* Prisma ORM
* PostgreSQL
* JWT
* Zod
* Jest
* Postman

---

# Fonctionnalités

## Authentification

* Register
* Login
* JWT Authentication
* Middleware `requireAuth`

---

## Wallet

Chaque utilisateur possède un wallet contenant :

* currency
* balance
* historique des transactions

---

## Transactions

### Deposit

Permet de créditer le wallet utilisateur.

### Withdraw

Permet de retirer des fonds du wallet.

### Transfer

Permet de transférer des fonds entre wallets avec frais.

---

# Architecture

The Wallet API follows a layered architecture separating routing, business logic and data access.

```text
Client (Postman / Frontend)
        |
        v
   Express API
        |
        v
 Middlewares
 - cors
 - express.json
 - requireAuth
 - idempotency
 - errorHandler
        |
        v
     Routes
 - auth.routes.ts
 - wallet.routes.ts
 - transactions.routes.ts
        |
        v
    Services
 - transactions.service.ts
        |
        v
     Prisma ORM
        |
        v
   PostgreSQL Database
```

## Explication de l’architecture

* **Client** : Postman ou un frontend envoie la requête
* **Express API** : reçoit la requête HTTP
* **Middlewares** : gèrent l’authentification, les erreurs et le parsing JSON
* **Routes** : définissent les endpoints accessibles
* **Services** : contiennent la logique métier
* **Prisma ORM** : communique avec la base de données
* **PostgreSQL** : stocke les données (users, wallets, transactions)

Cette architecture sépare clairement :

* transport HTTP
* sécurité
* logique métier
* persistance des données

---

# Database Design

L’API Wallet repose sur trois entités principales :

* **User**
* **Wallet**
* **Transaction**

Chaque utilisateur possède un wallet et peut effectuer des transactions.

---

## Entities

### User

```text
User
- id (UUID)
- phone (string)
- status (ACTIVE | SUSPENDED)
- role (USER | SYSTEM)
- createdAt (timestamp)
```

### Wallet

```text
Wallet
- id (UUID)
- userId (UUID)
- currency (string)
- balance (BigInt)
- createdAt (timestamp)
- updatedAt (timestamp)
```

### Transaction

```text
Transaction
- id (UUID)
- type (DEPOSIT | WITHDRAW | TRANSFER)
- fromWalletId (UUID)
- toWalletId (UUID)
- amount (BigInt)
- fee (BigInt)
- status (SUCCESS | FAILED | PENDING)
- createdAt (timestamp)
```

---

## Relationships

```text
User (1) ──────── (1) Wallet
                     |
                     |
                     |──────< Transaction
                          fromWalletId
                          toWalletId
```

### Description

* Un **User** possède un **Wallet**
* Un **Wallet** peut envoyer plusieurs **Transactions**
* Un **Wallet** peut recevoir plusieurs **Transactions**
* Une **Transaction** représente :

  * un dépôt
  * un retrait
  * un transfert

---

## Transaction Flow

```text
Sender Wallet
     |
     | amount + fee
     v
Receiver Wallet

Fee
 |
 v
System Wallet
```

Lors d’un **transfer** :

1. le wallet source est débité (`amount + fee`)
2. le wallet destination reçoit `amount`
3. le **System Wallet** reçoit les `fees`

---

# API Endpoints

## Public Endpoints

### Health Check

```
GET /health
```

Vérifie que l’API fonctionne correctement.

---

### Register

```
POST /auth/register
```

Crée un nouvel utilisateur.

---

### Login

```
POST /auth/login
```

Authentifie un utilisateur et retourne un **JWT**.

---

## Protected Endpoints

Les endpoints suivants nécessitent l’header :

```text
Authorization: Bearer <token>
```

---

### Get Current User

```
GET /me
```

Retourne les informations du user connecté.

---

### Get Wallet

```
GET /wallet
```

Retourne le wallet du user connecté.

---

### Get Transactions

```
GET /transactions
```

Retourne les transactions du wallet.

---

### Transfer

```
POST /transactions/transfer
```

Effectue un transfert entre wallets.

Headers requis :

```text
Authorization: Bearer <token>
Idempotency-Key: <unique-key>
```

---

### Deposit

```
POST /deposit
```

Crédite le wallet utilisateur.

---

### Withdraw

```
POST /withdraw
```

Débite le wallet utilisateur.

---

# API Examples

Les exemples suivants montrent comment utiliser l’API avec `curl`.

---

## Health Check

### Request

```bash
curl -X GET http://localhost:4000/health
```

### Response

```json
{
  "ok": true,
  "message": "API backend fonctionne"
}
```

---

## Register

### Request

```bash
curl -X POST http://localhost:4000/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "+2217XXXXXXXX",
    "password": "password123"
  }'
```

Exemple de numéro :

```
+221770000000
```

---

## Login

### Request

```bash
curl -X POST http://localhost:4000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "+2217XXXXXXXX",
    "password": "password123"
  }'
```

### Response

```json
{
  "ok": true,
  "token": "JWT_TOKEN"
}
```

---

## Get Wallet

```bash
curl -X GET http://localhost:4000/wallet \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## Get Transactions

```bash
curl -X GET http://localhost:4000/transactions \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## Transfer

```bash
curl -X POST http://localhost:4000/transactions/transfer \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Idempotency-Key: transfer-001" \
  -d '{
    "toWalletId": "WALLET_UUID",
    "amount": 100
  }'
```

---

## Deposit

```bash
curl -X POST http://localhost:4000/deposit \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "amount": 100
  }'
```

---

## Withdraw

```bash
curl -X POST http://localhost:4000/withdraw \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "amount": 100
  }'
```

---

# Installation

Clone le projet :

```bash
git clone https://github.com/bienvenuianniv-ops/money-app-backend.git
```

Installer les dépendances :

```bash
npm install
```

Configurer les variables d'environnement :

```
DATABASE_URL=postgresql://user:password@localhost:5432/wallet
JWT_SECRET=your_secret_key
PORT=4000
```

Lancer le serveur :

```bash
npm run dev
```

L'API sera disponible sur :

```
http://localhost:4000
```

---

# Tests

Lancer les tests :

```bash
npm test
```
