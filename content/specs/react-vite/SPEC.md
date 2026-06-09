---
name: react-vite
description: Production React SPA template - Vite 5, TanStack Router, TanStack Query, Tailwind, Zod-typed forms.
---

## What's included

A fast, opinionated single-page application built around the modern React stack — no Next.js, no SSR, no framework lock-in. **Vite 5** for builds and HMR. **TanStack Router** for fully type-safe routing with file-based conventions. **TanStack Query** for server state with cache invalidation patterns wired in. Forms via **react-hook-form** + **Zod** schemas shared between client validation and API contracts. **Tailwind v4** for styling, **shadcn/ui** as the component baseline. **Vitest** for unit tests, **Playwright** for end-to-end, **MSW** for API mocking in both.

Auth is **JWT with refresh tokens** and an Axios interceptor that handles silent renewal. State management is intentionally minimal — TanStack Query for server state, `useState`/`useReducer` for component state, **Zustand** only when prop drilling becomes painful. No Redux. **Sentry** for error tracking, **PostHog** (or Plausible) for product analytics, both wired with the router so route changes are automatically tracked

This is the project blueprint for "I have an existing API and I need a polished frontend that does not become a JavaScript fatigue casualty in twelve months." It is not the right choice if you're building from scratch and want SSR or backend-included scaffolding — pick `nextjs-saas` or `t3-stack` for those.

## Architecture

**File-based, type-safe routing.** TanStack Router generates a route tree from `src/routes/`. Route params, search params, loaders, and `useNavigate` calls are all typed end-to-end. Navigation is checked at compile time:

```tsx
// Type error if /users/$userId doesn't exist; type error if userId isn't a string
<Link to="/users/$userId" params={{ userId }} />

// Search params validated and typed via a Zod schema on the route
const { filter, page } = Route.useSearch();
```

Routes declare their own `loader` for data prefetching, `errorComponent` for graceful failure, and `pendingComponent` for loading states. The shell never has to coordinate them.

**Server state lives in TanStack Query, with a strict key convention.** Every API call goes through a typed `useQuery`/`useMutation` hook that lives next to the resource (`src/api/users.ts`, `src/api/orders.ts`). Query keys follow a tuple convention so invalidation is precise:

```ts
// queryKey: ['users', 'list', filters] or ['users', 'detail', id]
queryClient.invalidateQueries({ queryKey: ['users', 'list'] });
// not: invalidateQueries(['users']) — too broad, refetches detail pages too
```

Mutations use `onMutate` for optimistic updates with a captured snapshot for rollback on error. No `setQueryData` hacks; no global "refetch everything" buttons.

**Forms are schemas first.** Zod schemas live in `src/schemas/` and are imported by both the form (`zodResolver(userCreateSchema)`) and the API client (`userCreateSchema.parse(response.data)`). The same schema validates input client-side and narrows the server response. Errors are derived from Zod's `formatError()` and rendered without ad-hoc string matching.

**Auth interceptor, not auth context.** A single Axios interceptor handles `401` responses by attempting a token refresh, retrying the original request, and falling back to a route-level redirect to `/sign-in` if refresh fails. Components don't import an `AuthContext` — they call `useCurrentUser()` (a `useQuery` against `/me`) and let TanStack Query handle the loading and error states. This keeps auth out of the component tree.

**Code splitting follows routes.** Each route is `lazy()`-loaded by TanStack Router and ships as its own chunk. The initial bundle ships the shell, the public landing route, and the auth flow only. Heavier features (admin, billing, settings) load on navigation. `vite-bundle-visualizer` is wired into the build so regressions are easy to spot.

**Error boundaries at three levels.** A top-level boundary catches "the app is broken, please reload" failures. Each route declares its own `errorComponent` for "this page can't render right now, but the shell still works." Suspense boundaries inside routes handle "this widget is loading" — never the whole page.

## File structure

```
src/
├── routes/                  TanStack Router file-based routes
│   ├── __root.tsx           App shell, providers, top-level error boundary
│   ├── _public/             Marketing, sign-in, password reset
│   │   ├── route.tsx        Pathless layout that wraps all public routes
│   │   └── sign-in.tsx
│   └── _app/                Authenticated routes (guarded in route loader)
│       ├── route.tsx        Layout: sidebar, top nav, auth guard
│       ├── dashboard.tsx
│       ├── settings/
│       │   └── profile.tsx
│       └── users.$userId.tsx
├── api/
│   ├── client.ts            Axios instance + auth interceptor
│   └── <resource>.ts        Typed hooks per resource (useUsers, useUser, useCreateUser)
├── components/
│   ├── ui/                  shadcn/ui primitives (Button, Input, Dialog, ...)
│   └── <feature>/           Feature-scoped composites (UserCard, BillingPanel)
├── schemas/                 Zod schemas shared by forms and API client
├── hooks/                   Generic reusable hooks (useDebounce, useMediaQuery, ...)
├── lib/
│   ├── auth/                Token storage, refresh, route guards
│   ├── format/              Date/number/currency helpers (Intl wrappers)
│   └── analytics/           PostHog wrapper with route-change tracking
├── styles/                  Tailwind layer files, global resets
└── main.tsx                 Mount + provider wiring

tests/
├── setup.ts                 Vitest setup (jsdom, MSW server)
├── unit/                    Vitest + React Testing Library
├── mocks/                   MSW handlers, shared with E2E
└── e2e/                     Playwright specs

public/                      Static assets shipped untouched
```

## Getting started

```bash
# 1. Scaffold the project
npx specdriven add spec react-vite

# 2. Install and configure
cd .claude/specs/react-vite
cp env.example.txt .env

# 3. Set the values
#    - VITE_API_URL                e.g. http://localhost:8000
#    - VITE_AUTH_AUDIENCE          if using hosted IdP (Auth0, Clerk)
#    - VITE_SENTRY_DSN             optional; empty disables Sentry
#    - VITE_POSTHOG_KEY            optional

# 4. Run
pnpm install
pnpm dev                  # http://localhost:5173 with HMR
pnpm test                 # Vitest watch in another terminal
pnpm e2e                  # Playwright tests against the dev server
pnpm build && pnpm preview  # production build + preview server
```

The MSW server runs in `tests/` for both Vitest and Playwright, so unit and E2E tests share the same fixtures. Use `vite-bundle-visualizer` after `pnpm build` to inspect chunk sizes.

## Opinionated choices, with reasons

- **TanStack Router over React Router.** Real type safety on route params and search params, file-based conventions, built-in pending/error states, route-level data loaders. React Router 7 shipped typed routes more recently but TanStack Router was designed for it from the start and the search-param story is significantly better.
- **TanStack Query over SWR or Redux Toolkit Query.** Cache invalidation is the hard problem in frontend data — TanStack Query's `queryKey` invalidation and `onMutate` mutation patterns solve it without a global store. SWR is leaner but doesn't cover mutations or optimistic updates as well. RTK Query bundles a Redux store you usually don't need.
- **Zod over Yup or Joi.** TypeScript-first, infers types from schemas, the same schema runs on client and server. Yup predates TS as the default; Joi is heavier and Node-flavoured. Zod 4 also has the best discriminated-union ergonomics.
- **react-hook-form over Formik or TanStack Form.** Uncontrolled inputs (fewer re-renders), tiny bundle, mature ecosystem, first-class Zod integration. Formik is fine for small forms and dated for large ones. TanStack Form is promising but the ecosystem is younger.
- **Vite over CRA, Next.js, or webpack.** Faster cold start, faster HMR, native ESM dev server. CRA is unmaintained. Next.js is overkill if you don't need SSR.
- **Vitest over Jest.** Shares Vite config (one transform pipeline, not two), faster on watch, ESM-native. Jest works but needs more glue and Jest's TS handling has historically been the slowest part of CI.
- **MSW over `vi.mock` or per-test fakes.** Mocks at the network layer, so the same handlers serve unit tests, Playwright E2E, and Storybook. Avoids the "my mocks drifted from the real API shape" problem.
- **Axios over fetch.** Interceptors for auth refresh, cancellation tokens that compose with TanStack Query, request/response transforms. Native `fetch` is fine if you don't need an interceptor; once you do, you reinvent half of Axios.

## Testing strategy

**Unit tests** target hooks, utilities, and presentational components. React Testing Library queries by role and text, never by class name. MSW provides API responses so tests exercise the real query/mutation flow, not mocks of TanStack Query itself.

**Integration tests** mount route components with a real `QueryClient`, real router, and MSW. They cover the happy path, the loading state, and the error state. Components that take a `query` or `mutation` prop don't exist — the hook is the seam.

**E2E tests** in Playwright cover sign-in, the primary user journey, and the billing/checkout flow. They run against the production build (`pnpm preview`) with MSW disabled and a real test API. CI runs them in parallel; flaky tests are quarantined into a `@flaky` tag rather than skipped silently.

## Skills paired with this spec

- `code-reviewer` — review prompts tuned for React + TanStack Query patterns
- `test-writer` — Vitest + Testing Library + MSW conventions for components and hooks
- `e2e-playwright` — Playwright specs covering auth + happy paths
- `refactor-assistant` — common React anti-pattern fixes (effect abuse, prop drilling, premature `useMemo`)

Install individually with `npx specdriven add skill <slug>`, or accept them all when you install this spec.

## When this spec is the wrong fit

- **You need SSR or SEO for the app shell.** Use `nextjs-saas` or `t3-stack` — a Vite SPA can't render meaningful HTML to crawlers.
- **You're building a content site or blog.** Use Astro — React is overkill when 95% of the page is static.
- **You have no backend yet.** This spec assumes an API exists. Build that first (`nestjs-api`, `fastapi-service`, `go-service`).
- **Mobile-first app intended for app stores.** Use `expo-mobile`.
- **Extremely strict bundle-size budgets** (sub-50KB). React + TanStack Query alone exceeds that; reach for Preact + Solid for shipping at that scale.

If routing, data fetching, forms, and auth are the things you keep rewriting from scratch, this spec is the right shape for the job.
