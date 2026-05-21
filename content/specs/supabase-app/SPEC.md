---
name: supabase-app
description: Next.js + Supabase template - auth, Postgres, RLS, storage, realtime, all on Supabase.
---

## What's included

A leaner counterpoint to a roll-your-own SaaS stack: ship a real product on **Supabase** as the backend and **Next.js 15** as the frontend, and move on. **Supabase Auth** for email, OAuth, and magic links. **Supabase Postgres** with **row-level security** as the authorisation layer. **Supabase Storage** for files (with signed URLs and RLS-gated buckets). **Supabase Realtime** for live updates over WebSockets. **Edge Functions** (Deno) when you need server logic that doesn't belong in Next.js route handlers.

The Next.js side is App Router with React Server Components throughout. Server components use the Supabase server client (cookie-based session, refreshed by middleware). Client components use the browser client. **Tailwind v4** + **shadcn/ui** for UI. Forms via **react-hook-form** + **Zod**. Migrations are SQL files in `supabase/migrations/` and the local Supabase stack runs in Docker for offline development.

This is the project blueprint for "I want to ship in a weekend without owning Postgres, auth, file storage, and websocket infrastructure separately." It's the opposite philosophy from `nextjs-saas`: don't run the backend, rent it.

## Architecture

**Supabase is the backend. Next.js is just the frontend with route handlers.** Application data lives in Supabase Postgres. Auth tokens live in cookies set by `@supabase/ssr`. Files live in Supabase Storage. Realtime subscriptions go directly from the browser to Supabase. Next.js owns rendering and only the route handlers that *can't* be expressed as Supabase queries (webhooks from third parties, server-only integrations).

**RLS policies are your authorisation layer.** Every table has policies that read `auth.uid()` (or `auth.jwt()` claims for roles) and check ownership or membership:

```sql
CREATE POLICY "users see their own orders"
  ON orders FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "org members see org documents"
  ON documents FOR SELECT
  USING (
    org_id IN (
      SELECT org_id FROM org_members WHERE user_id = auth.uid()
    )
  );
```

The frontend talks to Postgres directly through the Supabase JS client — you don't ship a "users API" because the database is the API, gated by policies. Audit your policies the way you'd audit endpoints. Every policy ships with a corresponding **pgTAP** test that proves it allows what it should and denies what it shouldn't.

**Two Supabase clients, used in two places.**
- `createServerClient` (from `@supabase/ssr`) reads/writes the session cookie and runs in server components, layouts, and route handlers.
- `createBrowserClient` runs in client components and handles realtime subscriptions.

Never import the wrong one — there's an ESLint rule (`no-restricted-imports`) that enforces it. A shared `lib/supabase/middleware.ts` refreshes the session on every request so cookies don't expire mid-session.

**Realtime is opt-in per feature.** Don't subscribe to every table — open a channel only where the UI actually needs live updates:

```tsx
useEffect(() => {
  const channel = supabase
    .channel(`orders:user=${userId}`)
    .on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'orders', filter: `user_id=eq.${userId}` },
      (payload) => queryClient.setQueryData(['orders', userId], (old) => [...old, payload.new])
    )
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}, [userId, queryClient]);
```

Subscriptions are cleaned up in `useEffect` returns. Channel names are namespaced so a single user doesn't accidentally collide with another user's subscription.

**Schema and policies are migrations, not Studio clicks.** `supabase/migrations/` is the source of truth. The Studio is for inspecting state, not editing it. Migrations are timestamped (`20260520_120000_create_orders.sql`) and applied automatically by `supabase db reset` locally and by CI in production.

**Storage uses RLS-gated buckets and signed URLs.** Each bucket has policies that mirror the table policies (e.g. "users can read their own avatars"). Generated content (export PDFs, reports) goes through signed URLs with a short TTL — never plain bucket reads.

**Edge Functions for the things route handlers can't do.** Webhooks from Stripe, scheduled jobs (via Supabase cron triggers), and integrations that need a Deno runtime separate from Next.js. Edge Functions deploy independently; they don't share a build with the Next.js app.

## File structure

```
app/
├── (marketing)/             Public pages — landing, pricing, docs
├── (auth)/                  Sign-in, sign-up, magic-link callbacks, password reset
├── (app)/                   Authenticated routes
│   ├── layout.tsx           Auth guard, shell, sidebar
│   ├── dashboard/
│   ├── settings/
│   └── billing/
└── api/                     Route handlers (Stripe webhooks, server-only logic)

lib/
├── supabase/
│   ├── server.ts            createServerClient + cookie helpers
│   ├── client.ts            createBrowserClient (singleton)
│   ├── middleware.ts        Session refresh middleware
│   └── types.ts             Generated types from `supabase gen types`
├── auth/
│   ├── require-user.ts      Server-component helper that redirects if not signed in
│   └── require-role.ts      Same, but checks JWT app_metadata roles
├── format/                  Date/number/currency helpers
└── analytics/               PostHog wrapper

components/
├── ui/                      shadcn/ui primitives
└── <feature>/               Feature composites

supabase/
├── config.toml              Local Supabase config
├── migrations/              SQL migrations (schema + policies + seed data)
├── seed.sql                 Seed data for local dev
├── tests/                   pgTAP tests for RLS policies
└── functions/               Edge Functions (Deno)
    ├── stripe-webhook/
    └── send-digest/

middleware.ts                Next.js middleware that wires the Supabase session refresher
```

## Getting started

```bash
# 1. Scaffold the project
npx specdriven add spec supabase-app

# 2. Configure
cd .claude/specs/supabase-app
cp env.example.txt .env.local

# 3. Set the required values
#    - NEXT_PUBLIC_SUPABASE_URL
#    - NEXT_PUBLIC_SUPABASE_ANON_KEY
#    - SUPABASE_SERVICE_ROLE_KEY    route handlers only — never ship to client
#    - SUPABASE_PROJECT_ID          for `supabase link` and CI

# 4. Local Supabase
pnpm install
supabase start                # boots local Postgres + Studio + Storage in Docker
supabase db reset             # applies migrations + seed
supabase gen types typescript --local > lib/supabase/types.ts

# 5. Run
pnpm dev                      # http://localhost:3000
```

Supabase Studio runs at `http://localhost:54323` once `supabase start` is up. The Inbox tab shows captured emails (no real SMTP locally). `supabase test db` runs pgTAP policy tests.

## Opinionated choices, with reasons

- **Supabase over Firebase.** SQL, not a NoSQL document model. Real Postgres means real joins, real constraints, real transactions, and real RLS. Firebase shines for mobile-first apps with offline sync and a flexible schema; Supabase shines for product apps with relational data and a back-office. Most B2B SaaS is Supabase-shaped.
- **RLS over a separate API layer.** The database is the source of truth for authorisation. You write policies once and every client (web, mobile, scripts, partner integrations using a Supabase service role) inherits them. The cost is that you must test the policies — they're code, and an untested policy is an open door. The pgTAP tests in `supabase/tests/` are mandatory, not optional.
- **Cookie-based sessions over Bearer tokens.** Works seamlessly with SSR and React Server Components. The `@supabase/ssr` middleware handles refresh transparently. Bearer tokens in localStorage are a pre-RSC pattern.
- **Edge Functions sparingly.** Most logic fits in route handlers or Postgres functions. Edge Functions are for webhooks, scheduled jobs, and integrations that genuinely need a Deno runtime separate from Next.js. Don't migrate route handlers to Edge Functions "for performance" — the cold start is usually worse and the deploy story is more complex.
- **Local Supabase via Docker.** Develop offline, test migrations against a real local DB, push them once they pass. The hosted-only workflow ("edit in Studio, hope for the best") doesn't scale past one developer.
- **`supabase gen types` is part of CI.** Generated types live in the repo, regenerated on every migration. PRs that change the schema but don't regenerate types fail CI.

## Testing strategy

**RLS policies are tested with pgTAP** in `supabase/tests/`. Each policy has at least two tests: one positive (the right user *can* see the row), one negative (the wrong user *cannot*). These run via `supabase test db` in CI and locally before any policy change ships.

**Service-shaped functions** (Postgres functions, edge functions) get integration tests against the local Supabase stack — boot in Docker, apply migrations + seed, exercise the function.

**Component tests** use Vitest + React Testing Library with the Supabase client mocked at the network layer via MSW.

**E2E tests** in Playwright run against a fully-booted local Supabase + Next.js, signing in real test users and exercising the primary user journey.

## Skills paired with this spec

- `database-schema-design` — design Postgres tables and review RLS policies
- `code-reviewer` — review prompts tuned for Next.js + Supabase patterns and the two-client convention
- `security-auditor` — RLS policy verification, key handling, session hygiene, signed URL TTLs
- `test-writer` — pgTAP + Playwright patterns for policy and flow tests

Install individually with `npx specdriven add skill <slug>`, or accept them all when you install this spec.

## When this spec is the wrong fit

- **You need a multi-region active-active backend.** Supabase is regional; for global low-latency writes you'll want a different architecture, possibly with a CRDT store.
- **You're locked into a different cloud (AWS-only shop).** Self-hosted Supabase is possible but loses much of the appeal — `nextjs-saas` with RDS may suit you better.
- **You need full control over the auth UI/UX flow and identity provider chaining.** Use NextAuth with `nextjs-saas`.
- **The schema is complex and you want migrations in a real ORM tool (Drizzle, Prisma).** Drizzle + raw Postgres gives more flexibility — Supabase migrations are SQL files and that's the contract.
- **Heavy compute or background workloads.** Edge Functions are not the right place for a worker fleet. Reach for a separate worker (BullMQ + Redis, or Inngest) and keep Supabase as the data layer.

If shipping fast on a managed backend is the priority and you'd rather audit policies than build endpoints, this spec is the right shape.
