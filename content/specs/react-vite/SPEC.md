---
name: react-vite
description: Production React SPA template - Vite 5, TanStack Router, TanStack Query, Tailwind, Zod-typed forms.
---

## What's included

A fast, opinionated single-page application built around the modern React stack — no Next.js, no SSR, no framework lock-in. Vite 5 for builds and HMR. **TanStack Router** for fully type-safe routing with file-based conventions. **TanStack Query** for server state with cache invalidation patterns wired in. Forms via **react-hook-form** + **Zod** schemas shared between client validation and API contracts. Tailwind v4 for styling, shadcn/ui as the component baseline. Vitest for unit tests, Playwright for end-to-end.

Auth is **JWT-based with refresh tokens** and an Axios interceptor that handles silent renewal. State management is intentionally minimal — TanStack Query for server state, `useState`/`useReducer` for component state, Zustand only when prop drilling becomes painful. No Redux.

This is the project blueprint for "I have an existing API and I need a polished frontend." It is not the right choice if you're building from scratch and want server-side rendering or backend-included scaffolding — pick `nextjs-saas` or `t3-stack` for those.

## Architecture

**File-based, type-safe routing.** TanStack Router generates a route tree from the `routes/` directory. Route params, search params, and loaders are all typed end-to-end. Navigation is checked at compile time — `<Link to="/users/$userId" params={{ userId }} />` fails if the route doesn't exist.

**Server state lives in TanStack Query.** Every API call goes through a typed query function with a stable key structure (`['users', 'list', filters]`). Mutations invalidate exact keys, never broad strokes. Optimistic updates use `onMutate` + rollback rather than `setQueryData` hacks.

**Forms are schemas first.** Zod schemas live in `src/schemas/` and are imported by both the form components and the API client. The same schema validates input client-side and types the server response. No duplicated shape definitions.

**Auth interceptor, not auth context.** An Axios interceptor refreshes expired access tokens transparently and retries the failed request. Components don't know auth exists — they call the API, they get data or a 401 that bubbles to a route-level error boundary that redirects to sign-in.

**Code splitting follows routes.** TanStack Router's `lazy` boundaries split each route into its own chunk. The initial bundle ships the shell and the landing route only. Heavier features (admin, billing) load on navigation.

## File structure

```
src/
├── routes/                  TanStack Router file-based routes
│   ├── __root.tsx           App shell, providers, error boundary
│   ├── _public/             Marketing pages, sign-in
│   └── _app/                Authenticated routes
├── api/
│   ├── client.ts            Axios instance + auth interceptor
│   └── <resource>.ts        Typed query/mutation functions per resource
├── components/
│   ├── ui/                  shadcn/ui primitives
│   └── <feature>/           Feature-scoped composites
├── schemas/                 Zod schemas shared by forms and API client
├── hooks/                   Reusable hooks (useDebounce, useMediaQuery, ...)
└── lib/
    ├── auth/                Token storage, refresh logic
    └── format/              Date/number/currency helpers

tests/
├── unit/                    Vitest + React Testing Library
└── e2e/                     Playwright specs
```

## Getting started

```bash
# 1. Scaffold the project
npx specdriven add spec react-vite

# 2. Install and configure
cd .claude/specs/react-vite
cp env.example.txt .env

# 3. Set your API URL and (optional) auth provider keys
#    - VITE_API_URL
#    - VITE_AUTH_AUDIENCE (if using a hosted IdP like Auth0)

# 4. Run
pnpm install
pnpm dev
```

Vite dev server runs on port 5173 with HMR. Vitest watch mode runs alongside in a second terminal via `pnpm test`.

## Opinionated choices, with reasons

- **TanStack Router over React Router.** Real type safety on route params and search params, file-based conventions, built-in pending/error states. React Router shipped a typed API more recently but TanStack Router was designed for it from the start.
- **TanStack Query over SWR or Redux.** Cache invalidation is the hard part of frontend data — TanStack Query's `queryKey` invalidation and built-in mutation patterns solve it cleanly. SWR is leaner but doesn't cover mutations as well.
- **Zod over Yup or Joi.** TypeScript-first, infers types from schemas, the same schema runs on client and server. Yup was built before TS was the default.
- **react-hook-form over Formik.** Uncontrolled inputs, fewer re-renders, smaller bundle. Formik is fine for small forms and dated for large ones.
- **Vite over CRA/webpack.** Faster cold start, faster HMR, native ESM dev server. CRA is unmaintained.
- **Vitest over Jest.** Shares Vite config, faster on watch, ESM-native. Jest works but needs more glue.

## Skills paired with this spec

- `code-reviewer` — review prompts tuned for React + TanStack Query patterns
- `test-writer` — Vitest + Testing Library conventions for components and hooks
- `e2e-playwright` — Playwright specs covering auth + happy paths
- `refactor-assistant` — common React anti-pattern fixes (effect abuse, prop drilling)

Install individually with `npx specdriven add skill <slug>`, or accept them all when you install this spec.

## When this spec is the wrong fit

- **You need SSR or SEO for the app shell.** Use `nextjs-saas` or `t3-stack`.
- **You're building a static site or blog.** Use Astro — heavier React tooling is overkill.
- **You have no backend yet.** This spec assumes an API exists. Build that first.
- **Mobile-first app intended for app stores.** Use `expo-mobile`.

If routing, data fetching, and forms are the things you keep rewriting, this spec is the right shape for the job.
