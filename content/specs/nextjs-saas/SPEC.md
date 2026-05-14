---
name: nextjs-saas
description: "Production SaaS template with auth, billing, and multi-tenancy on Next.js 15 App Router."
---
## What's included

This spec ships a complete SaaS foundation: authentication via NextAuth with email magic links and OAuth providers, Stripe Checkout and Customer Portal for subscription billing, and row-level security in PostgreSQL for multi-tenancy. Every layer is production-wired from day one — no throwaway scaffolding.

The frontend is built on Next.js 15 App Router with React Server Components throughout. Tailwind handles styling. Resend powers transactional email for welcome flows, password resets, and billing receipts. The spec also includes a fully typed admin dashboard for user and subscription management.

## Architecture

The app follows a layered architecture: the App Router handles routing and server rendering, a thin service layer in `lib/` owns business logic, and `db/` contains Drizzle ORM schemas and migration files. Stripe webhooks land in a dedicated route handler with signature verification. All background jobs run via Vercel Cron.

Multi-tenancy is implemented at the database level using a `tenant_id` column on every user-facing table, enforced by Postgres row-level security policies. Application code never filters by tenant manually — the RLS policies do it automatically after the session context is set.

## Getting started

Run `npx specdriven add @specs/nextjs-saas` to scaffold the project. Copy `.env.example` to `.env.local` and fill in your Postgres connection string, NextAuth secret, Stripe keys, and Resend API key. Run `pnpm db:migrate` to apply the initial schema, then `pnpm dev` to start the dev server.

Stripe webhooks require a local tunnel during development. The spec includes a `pnpm stripe:listen` script that starts the Stripe CLI in forward mode targeting `localhost:3000/api/webhooks/stripe`.

## Included skills

The four bundled skills cover the full development lifecycle. `api-designer` keeps your internal API contracts clean as the product grows. `code-reviewer` enforces team conventions during PR review. `e2e-playwright` generates and maintains the end-to-end test suite for auth and billing flows. `security-auditor` runs OWASP checks before each release to catch secrets, IDOR vulnerabilities, and insecure headers.
