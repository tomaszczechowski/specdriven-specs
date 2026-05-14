---
name: nextjs-saas
description: Production SaaS template — Next.js 15 App Router, NextAuth, Stripe billing, Postgres multi-tenancy.
---

## What's included

A complete, opinionated SaaS foundation that ships production-wired from day one. Authentication via **NextAuth v5** with email magic links and GitHub OAuth. Subscription billing via **Stripe Checkout** and **Customer Portal**, with signed webhook handling. Multi-tenancy enforced at the database level by **PostgreSQL row-level security**, not by application-level filtering. Transactional email via **Resend**. A typed admin dashboard for user and subscription management.

The frontend is Next.js 15 App Router with React Server Components throughout. Tailwind v4 for styling. **Drizzle ORM** with migrations checked into git. Vercel for hosting, Vercel Cron for scheduled jobs. Sentry for error tracking and **Vercel Analytics** for product analytics.

This is the project blueprint for "I need to ship a SaaS in two weeks." It is not a hello-world template, and it is not aiming for maximum framework neutrality — it picks the stack that gets you to revenue fastest.

## Architecture

**Three layers, strict boundaries.** The App Router (`app/`) owns routing and rendering. A thin service layer (`lib/`) owns business logic, called from server components and route handlers but never the other way around. The data layer (`db/`) contains Drizzle schemas, migrations, and query builders.

**Multi-tenancy via Postgres RLS.** Every user-facing table has a `tenant_id` column with a row-level security policy that filters on `current_setting('app.tenant_id')`. The session middleware sets this Postgres session variable from the authenticated user's tenant. Application code never filters by tenant manually — if you forget the filter, RLS still blocks the query. This is the difference between "we have multi-tenancy" and "we have multi-tenancy that won't leak in three months when someone adds a new query."

**Stripe webhooks first, polling never.** Subscription state is the source of truth in Stripe. Locally we mirror the relevant fields (`status`, `current_period_end`, `price_id`) into a `subscriptions` table, updated only by signed webhook events. Reads go against the local mirror; writes go through Stripe API + webhook reconciliation. No polling, no drift.

**Server actions for mutations, route handlers for everything else.** Form submissions and CRUD use server actions for the type safety and progressive enhancement. Stripe webhooks, cron jobs, and third-party integrations land in route handlers (`app/api/...`).

**Email is async, idempotent, and traced.** Resend sends are wrapped in an idempotent helper that records send attempts in a `sent_emails` table keyed by `(user_id, template, idempotency_key)`. Failed sends get retried via Vercel Cron up to three times before being marked dead.

## File structure

```
app/
├── (marketing)/         Public pages — landing, pricing, docs
├── (auth)/              Sign-in, sign-up, magic-link callbacks
├── (app)/               Authenticated app shell
│   ├── settings/
│   ├── billing/         Stripe Customer Portal entry + plan picker
│   └── admin/           Owner-only dashboard
└── api/
    ├── webhooks/stripe/   Signature-verified, idempotent
    └── cron/              Cleanup + retries, gated by Vercel cron header

lib/
├── auth/                NextAuth config, session helpers
├── billing/             Stripe SDK wrapper, plan definitions
├── tenant/              RLS context helpers
├── email/               Resend wrapper, template registry
└── observability/       Logger, span helpers

db/
├── schema.ts            Drizzle table defs (users, tenants, subscriptions, ...)
├── migrations/          Generated SQL, checked into git
└── policies.sql         RLS policies, applied via migration
```

## Getting started

```bash
# 1. Scaffold the project
npx specdriven add spec nextjs-saas

# 2. Install deps and copy env
cd .claude/specs/nextjs-saas
cp env.example.txt .env.local

# 3. Fill in the values
#    - POSTGRES_URL (Neon or local Docker)
#    - NEXTAUTH_SECRET (openssl rand -base64 32)
#    - GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET
#    - STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET
#    - RESEND_API_KEY

# 4. Apply schema + RLS policies
pnpm db:migrate

# 5. Run
pnpm dev
```

For Stripe local development, run `stripe listen --forward-to localhost:3000/api/webhooks/stripe` in another terminal and copy the displayed webhook secret into `STRIPE_WEBHOOK_SECRET`.

## Opinionated choices, with reasons

- **NextAuth v5 over Clerk/Auth0/WorkOS.** Open-source, no per-user pricing, owns your user table. You give up a hosted login UI; you keep control of your auth flow and your data.
- **Drizzle over Prisma.** Better serverless cold starts (no rust binary), real SQL primitives when you need them, edge runtime compatible. Prisma is fine, Drizzle is leaner.
- **Stripe over LemonSqueezy/Paddle.** Mature webhooks, predictable Customer Portal, the largest ecosystem of tutorials and example code. The Merchant of Record alternatives matter only when you're shipping internationally before product-market fit; usually you aren't.
- **Postgres RLS over `WHERE tenant_id = ?` discipline.** Application-level tenant filtering is a tax that compounds. RLS makes the leak path impossible by construction.
- **Resend over SendGrid/Postmark.** React Email templates, modern API, generous free tier. Migrate to a higher-volume provider later if you hit deliverability limits.

## Skills paired with this spec

Each skill below is opinionated about the workflow it covers and assumes the architecture above:

- `code-reviewer` — review prompts tuned for Next.js + Drizzle patterns
- `api-designer` — REST and route handler conventions for the App Router
- `e2e-playwright` — auth flow + checkout flow tests with seeded Stripe fixtures
- `security-auditor` — RLS policy verification, webhook signature checks, secrets hygiene

Install any of them individually with `npx specdriven add skill <slug>`, or accept them all when you install this spec.

## When this spec is the wrong fit

- **Bootstrap a marketing site, not a product.** Use a static template — no auth, no billing, no DB.
- **B2C consumer apps with social login as the primary identity.** This spec leans toward B2B (organization tenants, role-based access).
- **Native mobile.** Use `expo-mobile` instead — different scaffold for different concerns.
- **Heavy compute or background workloads.** This spec keeps cron simple. For real worker fleets, lift the data layer into a separate service with a queue (BullMQ + Redis, or Inngest).

If you find yourself fighting any of the choices above, the spec is the wrong tool — copy the parts you want and skip the rest.
