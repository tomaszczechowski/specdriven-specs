---
name: t3-stack
description: Type-safe full-stack starter — Next.js, tRPC, Prisma, NextAuth, Tailwind. Curated, hosted upstream.
---

## Why this spec

The T3 stack is the reference choice when you want **end-to-end type safety without rolling your own** — types flow from the database schema (Prisma) through the API layer (tRPC) into React components, with zero hand-written API contracts. For projects where the team is comfortable in Next.js and the surface area is "internal tooling + customer dashboards," this scaffold gets you to a working app faster than almost anything else.

It is maintained by the T3 community (Theo Brown and contributors), with a sizable ecosystem of tutorials, video walkthroughs, and ports. **The base template lives upstream at `t3-oss/create-t3-app`** — we don't mirror it. Installing this spec via `specdriven` pulls files directly from the source repository.

## When to pick T3 over `nextjs-saas`

Both are Next.js-based, but they optimize for different things:

| Question | T3 stack | `nextjs-saas` |
| --- | --- | --- |
| Type safety across the API boundary | First-class via tRPC | Manual via Zod + server actions |
| Multi-tenancy / row-level security | Not addressed; you add it | Postgres RLS shipped in |
| Stripe / billing | Not included | Stripe Checkout + Customer Portal + webhooks wired |
| Best for | Internal tools, dashboards, B2B utilities | Customer-facing SaaS with subscription billing |
| ORM | Prisma | Drizzle |

Rule of thumb: if you're **selling something with subscriptions**, start with `nextjs-saas`. If you're building **typed CRUD on top of Postgres** without billing, T3 will get you there faster.

## What's in the base template

- **Next.js 15 App Router** with TypeScript strict mode
- **tRPC v11** with the React Query integration — auto-typed API calls, no manifest sync, no codegen
- **Prisma** with a SQLite default (swap to Postgres via `DATABASE_URL`)
- **NextAuth v5** with Discord OAuth out of the box
- **Tailwind v3** with sensible defaults
- **ESLint + Prettier** configured

Optional add-ons offered by the upstream `create-t3-app` CLI:
- Drizzle instead of Prisma
- App Router or Pages Router
- App-level styles and dark mode

## Opinionated commentary

A few things to know going in:

- **tRPC is the productivity unlock, but also the lock-in.** Once your app is built on tRPC, moving the API to a separate service (Go, Python, etc.) is a meaningful refactor. For a Next.js-shaped app this is fine. If you suspect you'll outgrow Next.js as the API layer, prefer a typed REST/GraphQL approach instead.
- **The default Discord OAuth is illustrative, not prescriptive.** Replace with GitHub, Google, email magic-link, or your IdP of choice on day one — see the NextAuth docs.
- **SQLite default → Postgres production.** The base template uses SQLite for zero-config dev. Switch to Postgres before deploying anywhere multi-user. The Prisma schema syntax is the same; you change the datasource provider.
- **No background jobs, no email, no payments.** T3 is intentionally minimal. Add Resend / Stripe / Inngest as you need them.

## Skills that pair well

- `code-reviewer` — reviews tuned for tRPC procedure shapes and Prisma model definitions
- `e2e-playwright` — auth + protected route tests using NextAuth fixtures

## Getting started

```bash
# Install this spec — fetches the base template from the upstream repo
npx specdriven add spec t3-stack -a claude-code

# Or use the official scaffolder for the interactive picker
npm create t3-app@latest
```

The `specdriven` install pulls files directly from `t3-oss/create-t3-app/cli/template/base` on `main`. For the full interactive setup (with the optional add-ons), running `npm create t3-app@latest` is the canonical path.
