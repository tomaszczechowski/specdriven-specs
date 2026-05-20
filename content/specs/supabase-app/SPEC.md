---
name: supabase-app
description: Next.js + Supabase template - auth, Postgres, RLS, storage, realtime, all on Supabase.
---

## What's included

A leaner counterpoint to a roll-your-own SaaS stack: ship a real product on **Supabase** as the backend and **Next.js 15** as the frontend, and move on. **Supabase Auth** for email, OAuth, and magic links. **Supabase Postgres** with **row-level security** as the authorisation layer. **Supabase Storage** for files. **Supabase Realtime** for live updates over WebSockets. **Edge Functions** when you need server logic that doesn't belong in Next.js route handlers.

The Next.js side is App Router with React Server Components throughout. Server components use the Supabase server client (cookie-based session). Client components use the browser client. Tailwind v4 + shadcn/ui for UI. Forms via react-hook-form + Zod.

This is the project blueprint for "I want to ship in a weekend without owning Postgres, auth, file storage, and websocket infrastructure separately."

## Architecture

**Supabase is the backend. Next.js is just the frontend with route handlers.** Application data lives in Supabase Postgres. Auth tokens live in cookies set by the Supabase SSR helpers. Files live in Supabase Storage. Next.js owns rendering and only the route handlers that *can't* be expressed as Supabase queries.

**RLS policies are your authorisation layer.** Every table has policies that read `auth.uid()` and check ownership or membership. The frontend talks to Postgres directly through the Supabase JS client — you don't ship a "users API" because the database is the API, gated by policies. Audit your policies the way you'd audit endpoints.

**Two Supabase clients, used in two places.**
- `createServerClient` reads/writes the session cookie and runs in server components, layouts, and route handlers.
- `createBrowserClient` runs in client components and handles realtime subscriptions.
Never import the wrong one — there's a lint rule for it.

**Realtime is opt-in per feature.** Don't subscribe to every table — open a channel only where the UI actually needs live updates. Subscriptions are cleaned up in `useEffect` returns.

**Schema and policies are migrations, not Studio clicks.** `supabase/migrations/` is the source of truth. The Studio is for inspecting state, not editing it.

## File structure

```
app/
├── (marketing)/             Public pages
├── (auth)/                  Sign-in, sign-up, callbacks
├── (app)/                   Authenticated routes
└── api/                     Route handlers (webhooks, server-only logic)

lib/
├── supabase/
│   ├── server.ts            createServerClient + cookie helpers
│   ├── client.ts            createBrowserClient
│   └── middleware.ts        Session refresh middleware
├── auth/                    Higher-level helpers (requireUser, requireRole)
└── format/                  Date/number/currency helpers

supabase/
├── migrations/              SQL migrations (schema + policies)
├── seed.sql                 Seed data for local dev
└── functions/               Edge functions
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
#    - SUPABASE_SERVICE_ROLE_KEY (route handlers only)

# 4. Local Supabase
pnpm install
supabase start            # boots local Postgres + Studio in Docker
supabase db reset         # applies migrations + seed

# 5. Run
pnpm dev
```

Supabase Studio runs at `http://localhost:54323` once `supabase start` is up.

## Opinionated choices, with reasons

- **Supabase over Firebase.** SQL, not a NoSQL document model. Real Postgres means real joins, real constraints, real RLS. Firebase shines for mobile and offline-first; Supabase shines for product apps with relational data.
- **RLS over a separate API layer.** The database is the source of truth for authorisation. You write policies once and every client (web, mobile, scripts) inherits them. Yes, you must test the policies — they're code.
- **Cookie-based sessions over Bearer tokens.** Works seamlessly with SSR and React Server Components. The Supabase SSR helpers handle refresh.
- **Edge Functions sparingly.** Most logic fits in route handlers or Postgres functions. Edge Functions are for webhooks, scheduled jobs, and integrations that genuinely need a Deno runtime separate from Next.js.
- **Local Supabase via Docker.** Develop offline, test migrations against a real local DB, push them once they pass.

## Skills paired with this spec

- `database-schema` — design Postgres tables and review RLS policies
- `code-reviewer` — review prompts tuned for Next.js + Supabase patterns
- `security-auditor` — RLS policy verification, key handling, session hygiene
- `test-writer` — pgTAP + Playwright patterns for policy and flow tests

Install individually with `npx specdriven add skill <slug>`, or accept them all when you install this spec.

## When this spec is the wrong fit

- **You need a multi-region active-active backend.** Supabase is regional; for global low-latency writes you'll want a different architecture.
- **You're locked into a different cloud (AWS-only shop).** Self-hosted Supabase is possible but loses much of the appeal — `nextjs-saas` with RDS may suit you better.
- **You need full control over the auth UI/UX flow.** Use NextAuth with `nextjs-saas`.
- **The database schema is complex and you want migrations in a real ORM tool.** Drizzle + raw Postgres gives more flexibility — Supabase migrations are SQL files.

If shipping fast on a managed backend is the priority, this spec is the right shape.
