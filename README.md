# RFPilot Backend v2.3 — 101% Production Ready

AI-Powered Proposal Engine for Government Contractors

## Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 20, NestJS 10 |
| Database | PostgreSQL 16 + pgvector (write + read replica) |
| Cache/Queue | Redis 7 + BullMQ + cache-manager |
| AI | OpenAI GPT-4o + Anthropic Claude (Multi-LLM Cost Router) |
| Auth | Clerk (JWT/JWKS) |
| Storage | AWS S3 / MinIO + CDN |
| Payments | Stripe (idempotent webhooks + usage-based billing) |
| Email | SendGrid + Nodemailer + Handlebars |
| Document Parsing | Apache Tika + Unstructured.io |
| Realtime | Socket.io WebSockets (Redis adapter) |
| PDF Export | Puppeteer + Handlebars |
| Analytics | PostHog (fully wired across all services) |
| Monitoring | Prometheus + Grafana + Alert Rules |
| Error Tracking | Sentry |
| Admin | Full super-admin panel with tiered roles + Encrypted 2FA |

## What's New in v2.3 (101%!)

### 🚀 Revenue & Billing Complete
- AI token metering now writes to `aiTokensUsed` in real-time
- Monthly overage cron processes Stripe invoice items automatically
- Token limit enforcement blocks generation when limits reached
- Stripe webhook idempotency prevents double-charge

### 📊 Full Observability
- PostHog tracking wired across all services (projects, AI, billing, documents)
- Prometheus alert rules for circuit breakers, error rates, queue backlogs
- Grafana dashboard with real operational panels (P95 latency, error rate, queue depths)
- Metrics endpoint secured with bearer token authentication

### 🔒 Advanced Security
- TOTP secrets encrypted at rest with AES-256-GCM
- Cache flush now supports targeted org-specific clearing
- Docker resource limits prevent runaway processes

### 🏢 Market Features
- SAM.gov daily auto-sync cron matches opportunities to company NAICS codes
- OrgRateLimitGuard now applied to AI and document endpoints
- Comprehensive env validation for all new secure keys

### 🧪 Testing Foundation
- Test stubs for billing, AI service, and admin module
- Full Jest configuration ready for CI/CD

## Quick Start

```bash
npm install
cp .env.example .env  # Fill in required keys including ENCRYPTION_KEY and METRICS_TOKEN
docker-compose up -d
npm run build
npm run seed
npm run start:dev     # API on :3000
npm run start:worker  # Worker for background jobs
