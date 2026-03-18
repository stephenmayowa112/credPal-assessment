# FX Trading Backend

A production-ready backend for a multi-currency FX trading platform built with NestJS, PostgreSQL, and Redis.

---

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Setup Instructions](#setup-instructions)
- [Environment Variables](#environment-variables)
- [Database Setup](#database-setup)
- [Running the Application](#running-the-application)
- [API Documentation](#api-documentation)
- [Key Assumptions](#key-assumptions)
- [Architectural Decisions](#architectural-decisions)
- [Security Considerations](#security-considerations)
- [Scalability Notes](#scalability-notes)
- [Testing](#testing)

---

## Features

- User registration with OTP email verification
- JWT authentication (access + refresh tokens)
- Multi-currency wallet (NGN, USD, EUR, GBP, CAD, AUD, JPY)
- Wallet funding in NGN
- Real-time FX rate fetching with Redis caching
- Currency conversion and trading with atomic balance updates
- Full transaction history with filtering and pagination
- Idempotency support to prevent duplicate transactions
- Rate limiting, security headers, and input validation
- Swagger API documentation

---

## Tech Stack

- **Framework**: NestJS (Node.js / TypeScript)
- **Database**: PostgreSQL 14+ with TypeORM
- **Cache**: Redis 6+
- **Authentication**: JWT via `@nestjs/jwt` + `passport-jwt`
- **Password Hashing**: bcrypt (cost factor 10)
- **Validation**: `class-validator`, `class-transformer`
- **Email**: Nodemailer (Gmail SMTP or any SMTP provider)
- **API Docs**: Swagger (`@nestjs/swagger`)
- **Rate Limiting**: `@nestjs/throttler`
- **Security**: `helmet`, CORS

---

## Prerequisites

- Node.js 18+
- PostgreSQL 14+
- Redis 6+
- An SMTP account (e.g., Gmail with App Password)
- An FX API key from [exchangerate-api.com](https://www.exchangerate-api.com) or similar

---

## Setup Instructions

### 1. Clone the repository

```bash
git clone https://github.com/stephenmayowa112/credPal-assessment.git
cd credPal-assessment
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

```bash
cp .env.example .env
# Edit .env with your actual values
```

### 4. Set up the database

```bash
# Create the PostgreSQL database
createdb fx_trading_db

# Run migrations
npm run migration:run
```

### 5. Start the application

```bash
# Development
npm run start:dev

# Production
npm run build && npm start
```

---

## Environment Variables

| Variable | Description | Example |
|---|---|---|
| `PORT` | Server port | `3000` |
| `NODE_ENV` | Environment | `development` |
| `ALLOWED_ORIGINS` | CORS allowed origins | `http://localhost:3000` |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@localhost:5432/fx_trading_db` |
| `REDIS_URL` | Redis connection string | `redis://localhost:6379` |
| `JWT_SECRET` | Access token signing secret | `your-secret` |
| `JWT_REFRESH_SECRET` | Refresh token signing secret | `your-refresh-secret` |
| `SMTP_HOST` | SMTP server host | `smtp.gmail.com` |
| `SMTP_PORT` | SMTP server port | `587` |
| `SMTP_USER` | SMTP username / email | `you@gmail.com` |
| `SMTP_PASS` | SMTP password or App Password | `your-app-password` |
| `SMTP_FROM_EMAIL` | Sender email address | `you@gmail.com` |
| `SMTP_FROM_NAME` | Sender display name | `FX Trading Platform` |
| `FX_API_URL` | Base URL for FX rate API | `https://api.exchangerate-api.com/v4/latest` |

> For Gmail, generate an [App Password](https://support.google.com/accounts/answer/185833) rather than using your account password.

---

## Database Setup

### Run migrations

```bash
npm run migration:run
```

### Generate a new migration

```bash
npm run migration:generate -- -n MigrationName
```

### Revert last migration

```bash
npm run migration:revert
```

### Schema overview

| Table | Purpose |
|---|---|
| `users` | User accounts with email + hashed password |
| `otps` | Hashed OTP codes with expiry for email verification |
| `wallets` | One wallet per user (container) |
| `wallet_balances` | Per-currency balance rows (unique on wallet_id + currency) |
| `transactions` | Immutable audit log of all funding, conversion, and trade events |

---

## Running the Application

```bash
# Development (with hot reload)
npm run start:dev

# Debug mode
npm run start:debug

# Production
npm run build
npm start
```

Once running, Swagger UI is available at:

```
http://localhost:3000/api/docs
```

---

## API Documentation

All protected endpoints require the `Authorization: Bearer <accessToken>` header.

### Authentication

#### `POST /auth/register`
Register a new user. Sends a 6-digit OTP to the provided email.

**Request body:**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123"
}
```

**Response `201`:**
```json
{
  "userId": "uuid",
  "message": "Registration successful. Please check your email for OTP verification."
}
```

---

#### `POST /auth/verify-email`
Verify email address using the OTP received. OTPs expire after 10 minutes.

**Request body:**
```json
{
  "userId": "uuid",
  "otp": "123456"
}
```

**Response `200`:**
```json
{
  "success": true,
  "message": "Email verified successfully"
}
```

---

#### `POST /auth/login`
Authenticate a verified user and receive JWT tokens.

**Request body:**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123"
}
```

**Response `200`:**
```json
{
  "accessToken": "eyJ...",
  "refreshToken": "eyJ...",
  "tokenType": "Bearer",
  "expiresIn": 900
}
```

---

#### `POST /auth/refresh`
Exchange a refresh token for a new access token.

**Request body:**
```json
{
  "refreshToken": "eyJ..."
}
```

**Response `200`:**
```json
{
  "accessToken": "eyJ...",
  "tokenType": "Bearer",
  "expiresIn": 900
}
```

---

#### `POST /auth/resend-otp`
Resend a new OTP (invalidates all previous unused OTPs).

**Request body:**
```json
{
  "userId": "uuid"
}
```

**Response `200`:**
```json
{
  "success": true,
  "message": "OTP resent successfully"
}
```

---

### Wallet

> All wallet endpoints require authentication.

#### `GET /wallet`
Get the authenticated user's wallet balances across all currencies.

**Response `200`:**
```json
{
  "walletId": "uuid",
  "balances": [
    { "currency": "NGN", "balance": "5000.000000" },
    { "currency": "USD", "balance": "12.500000" }
  ]
}
```

---

#### `POST /wallet/fund`
Fund the wallet in NGN. Requires an idempotency key to prevent duplicate funding.

**Request body:**
```json
{
  "amount": 5000.00,
  "idempotencyKey": "unique-key-at-least-16-chars"
}
```

**Response `200`:**
```json
{
  "success": true,
  "newBalance": "6000.000000",
  "currency": "NGN",
  "transactionId": "uuid"
}
```

---

#### `POST /wallet/convert`
Convert between two currencies using real-time FX rates. Atomically debits source and credits target.

**Request body:**
```json
{
  "sourceCurrency": "NGN",
  "targetCurrency": "USD",
  "sourceAmount": 1000.00,
  "idempotencyKey": "unique-key-at-least-16-chars"
}
```

**Response `200`:**
```json
{
  "success": true,
  "sourceAmount": "1000.000000",
  "targetAmount": "0.625000",
  "fxRate": "0.000625",
  "sourceCurrency": "NGN",
  "targetCurrency": "USD",
  "transactionId": "uuid"
}
```

---

#### `POST /wallet/trade`
Trade between currencies (functionally equivalent to convert; semantically represents a market trade).

**Request body:**
```json
{
  "fromCurrency": "EUR",
  "toCurrency": "NGN",
  "amount": 50.00,
  "idempotencyKey": "unique-key-at-least-16-chars"
}
```

**Response `200`:**
```json
{
  "success": true,
  "fromAmount": "50.000000",
  "toAmount": "85000.000000",
  "fxRate": "1700.000000",
  "fromCurrency": "EUR",
  "toCurrency": "NGN",
  "transactionId": "uuid"
}
```

---

### FX Rates

#### `GET /fx/rates`
Retrieve current FX rates for supported currency pairs. Rates are cached in Redis for 5 minutes.

**Query params:** `from=NGN&to=USD`

**Response `200`:**
```json
{
  "from": "NGN",
  "to": "USD",
  "rate": 0.000625,
  "cachedAt": "2026-03-18T10:00:00Z"
}
```

---

### Transactions

#### `GET /transactions`
View paginated transaction history for the authenticated user.

**Query params (all optional):**

| Param | Type | Description |
|---|---|---|
| `type` | `FUNDING \| CONVERSION \| TRADE` | Filter by type |
| `currency` | string | Filter by source or target currency |
| `startDate` | ISO 8601 | Filter from date |
| `endDate` | ISO 8601 | Filter to date |
| `page` | number | Page number (default: 1) |
| `limit` | number | Items per page (default: 20, max: 100) |

**Response `200`:**
```json
{
  "data": [
    {
      "id": "uuid",
      "type": "CONVERSION",
      "sourceCurrency": "NGN",
      "targetCurrency": "USD",
      "sourceAmount": "1000.000000",
      "targetAmount": "0.625000",
      "fxRate": "0.000625",
      "status": "SUCCESS",
      "createdAt": "2026-03-18T10:00:00Z"
    }
  ],
  "total": 42,
  "page": 1,
  "limit": 20
}
```

---

### Health Check

#### `GET /health`
Returns
 application health status.

**Response `200`:**
```json
{ "status": "ok" }
```

---

## Key Assumptions

1. **Wallet funding is NGN-only.** Users fund their wallet in Naira first, then convert to other currencies. Direct foreign currency funding is not supported in this version.

2. **Initial NGN balance.** Every new user receives an initial NGN balance of 1,000 NGN upon registration to allow immediate testing of conversion features.

3. **FX rates are fetched from exchangerate-api.com.** The base currency for rate lookups is the source currency. Cross-rates (e.g., EUR → GBP) are computed by chaining through the API response.

4. **FX rates are cached for 5 minutes in Redis.** This balances freshness with performance and reduces external API calls. If Redis is unavailable, the system falls back to a direct API call.

5. **Supported currencies** are: NGN, USD, EUR, GBP, CAD, AUD, JPY. The list is configurable and easy to extend.

6. **Idempotency keys are required** for all state-mutating wallet operations (fund, convert, trade). A duplicate key returns the original transaction result without re-processing.

7. **OTPs expire after 10 minutes** and are hashed with bcrypt before storage. Plain-text OTPs are never persisted.

8. **Access tokens expire in 15 minutes; refresh tokens in 7 days.** This follows a short-lived access / long-lived refresh pattern for security.

9. **Conversion and Trade are semantically distinct** but mechanically identical — both atomically debit the source currency and credit the target currency using the live FX rate. They are recorded with different transaction types for analytics purposes.

10. **No partial fills.** A conversion either completes fully or fails entirely (atomic transaction). There is no concept of partial execution.

11. **Balance precision** is stored as `DECIMAL(18, 6)` to handle both large NGN amounts and small fractional values in currencies like JPY or USD.

---

## Architectural Decisions

### 1. Multi-currency wallet model

Rather than a single `balance` column on the wallet, balances are stored in a separate `wallet_balances` table with a `(wallet_id, currency)` unique constraint. This allows:
- Unlimited currency support without schema changes
- Efficient per-currency queries
- A `CHECK (balance >= 0)` constraint at the database level to prevent negative balances

### 2. Atomic transactions with database-level locking

All balance mutations (fund, convert, trade) use TypeORM `QueryRunner` with explicit `BEGIN / COMMIT / ROLLBACK`. For concurrent requests, `SELECT ... FOR UPDATE` row-level locking is applied on the `wallet_balances` rows being modified, preventing race conditions and double-spending.

### 3. Idempotency

Every mutating endpoint accepts an `idempotencyKey`. Before processing, the system checks the `transactions` table for an existing record with that key. If found, the original result is returned immediately. This makes retries safe and prevents duplicate charges.

### 4. Redis caching for FX rates

FX rates are cached in Redis with a 5-minute TTL. The cache key is `fx_rate:{from}:{to}`. On cache miss, the system fetches from the external API and repopulates the cache. If the external API is down, the system returns the last known cached rate with a staleness warning, or raises a `ServiceUnavailableException` if no cached value exists.

### 5. OTP security

OTPs are 6-digit numeric codes generated with `Math.random()` (sufficient for low-security verification codes). They are hashed with bcrypt before storage so that a database breach does not expose valid OTPs. Each resend invalidates all previous unused OTPs for the user.

### 6. JWT dual-token strategy

- **Access token** (15 min): Short-lived, used for API authorization.
- **Refresh token** (7 days): Long-lived, used only to obtain new access tokens.

Both are signed with separate secrets (`JWT_SECRET` and `JWT_REFRESH_SECRET`) so a compromised access token secret does not compromise refresh tokens.

### 7. Global JWT guard with `@Public()` escape hatch

A global `JwtAuthGuard` is applied to all routes via `APP_GUARD`. Public routes (register, login, verify, health) are decorated with `@Public()` to opt out. This means new routes are protected by default — a secure-by-default posture.

### 8. Modular NestJS structure

Each domain (auth, wallet, trading, FX, transactions) is encapsulated in its own NestJS module with its own controller, service, and DTOs. This follows the single-responsibility principle and makes the codebase easy to extend or extract into microservices.

### 9. Database migrations

Schema changes are managed via TypeORM migrations rather than `synchronize: true`. This ensures production deployments are controlled and reversible.

---

## Security Considerations

- Passwords hashed with bcrypt (cost factor 10)
- OTPs hashed with bcrypt before storage
- JWT secrets are environment-variable-only (never hardcoded)
- `helmet` sets security-related HTTP headers
- CORS restricted to `ALLOWED_ORIGINS`
- Rate limiting: 60 requests/minute globally via `@nestjs/throttler`
- SQL injection prevented by TypeORM parameterized queries
- `CHECK (balance >= 0)` constraint prevents negative balances at DB level
- Row-level locking prevents race conditions on concurrent balance updates

---

## Scalability Notes

- **Horizontal scaling**: The app is stateless (JWT-based auth, Redis for shared cache). Multiple instances can run behind a load balancer.
- **Database**: PostgreSQL with indexed `user_id` and `created_at` columns on `transactions` for efficient queries at scale. Connection pooling is configured via TypeORM.
- **Redis**: FX rate caching reduces external API dependency and latency. At higher scale, Redis Cluster can be adopted with no application changes.
- **Adding currencies**: Add the currency code to the supported list in the FX service config. No schema changes required.
- **Adding trading pairs**: The system supports any pair that the FX API provides. No code changes needed for new pairs.
- **Queue-based email**: At scale, OTP emails should be dispatched via a job queue (e.g., BullMQ + Redis) to decouple registration latency from email delivery.

---

## Testing

```bash
# Run all tests (single pass)
npm test -- --run

# Watch mode
npm run test:watch

# Coverage report
npm run test:cov
```

Test files are co-located with their modules (e.g., `authentication.service.spec.ts`). Critical coverage areas:
- Wallet balance updates (fund, convert, trade)
- OTP generation, hashing, and expiry
- FX rate cache hit/miss behaviour
- Idempotency key deduplication
- Insufficient balance rejection
