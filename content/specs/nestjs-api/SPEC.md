---
name: nestjs-api
description: Production NestJS API template - REST + GraphQL, Prisma, Passport JWT, BullMQ jobs, OpenTelemetry.
---

## What's included

A modular Node.js backend built on **NestJS 10**, structured around feature modules and dependency injection. Exposes both **REST controllers** and an **Apollo GraphQL** endpoint from the same service layer — pick the transport per feature, not for the whole app. Persistence via **Prisma** with migrations checked into git. Authentication via **Passport JWT** with refresh tokens and OAuth (GitHub, Google) ready to wire up. Background jobs via **BullMQ** with a dedicated worker process. Observability via **OpenTelemetry** with auto-instrumentation for HTTP, Prisma, and BullMQ.

Validation uses **class-validator** + **class-transformer** on DTOs, enforced by a global `ValidationPipe`. Errors are mapped to consistent HTTP responses (REST) and `GraphQLError` extensions (GraphQL) by a single exception filter. Configuration loads from environment via `@nestjs/config` with Zod-validated schemas.

This is the project blueprint for "I need a typed, modular backend with clean boundaries that scales past one team."

## Architecture

**Modules are the unit of feature ownership.** Each feature (`users`, `billing`, `webhooks`) is a Nest module: controller + resolver + service + repository. Modules import only what they need. No "shared everything" barrel.

**Service layer is transport-agnostic.** Controllers and GraphQL resolvers are thin — they translate input, call the service, return the result. The service has no knowledge of HTTP or GraphQL. The same `UserService.create(...)` is callable from a REST POST, a GraphQL mutation, or a queue worker.

**Prisma + repository pattern, lightly.** Services depend on a per-feature repository class that wraps Prisma calls. This is not heavy DDD — the repository exists so you can mock it in tests and so service code reads in domain terms (`repo.findActiveByTenant`) rather than Prisma query terms.

**Jobs are first-class, not afterthoughts.** BullMQ queues live alongside the modules that own them. The worker process boots the same DI container but only imports the modules it needs. Queues have explicit retry policies, dead-letter handling, and metrics.

**Errors are typed and mapped centrally.** Domain errors (`UserAlreadyExistsError`, `BillingNotEnabledError`) are plain classes. A single `AllExceptionsFilter` maps them to HTTP status codes and GraphQL error extensions. Controllers never `throw new HttpException`.

## File structure

```
src/
├── main.ts                  Bootstrap (HTTP + GraphQL)
├── worker.ts                BullMQ worker process entry
├── app.module.ts            Root module
├── config/                  Zod-validated env config
├── common/
│   ├── filters/             Exception filter
│   ├── guards/              JWT + roles guards
│   ├── interceptors/        Logging, transform, timeout
│   └── decorators/          @CurrentUser, @Public, ...
├── auth/                    Passport JWT + OAuth strategies
├── users/                   Example feature module
│   ├── users.controller.ts
│   ├── users.resolver.ts
│   ├── users.service.ts
│   ├── users.repository.ts
│   ├── dto/
│   └── entities/
└── jobs/                    Shared queue setup + worker registration

prisma/
├── schema.prisma            Single source of truth
└── migrations/              Generated SQL
```

## Getting started

```bash
# 1. Scaffold the project
npx specdriven add spec nestjs-api

# 2. Install and configure
cd .claude/specs/nestjs-api
cp env.example.txt .env

# 3. Set the required values
#    - DATABASE_URL (Postgres)
#    - REDIS_URL (for BullMQ)
#    - JWT_SECRET (openssl rand -base64 32)
#    - GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET (optional)

# 4. Apply migrations and seed
pnpm install
pnpm prisma migrate dev
pnpm db:seed

# 5. Run API and worker
pnpm dev:api     # http://localhost:3000  + /graphql
pnpm dev:worker  # in another terminal
```

GraphQL Playground is available at `/graphql` in development. OpenAPI/Swagger UI at `/docs`.

## Opinionated choices, with reasons

- **NestJS over Express/Fastify directly.** Modules, DI, pipes, and guards give you a real architecture out of the box. Yes, it's heavier — but the bigger the team and the codebase, the more that structure pays off. For 200-line APIs, use Fastify directly.
- **Prisma over TypeORM/Drizzle.** Best-in-class developer ergonomics for Node + relational databases. Migration tooling is solid. Drizzle is closing the gap but Prisma still wins on team adoption.
- **GraphQL co-located with REST.** Don't force every consumer through one transport. Internal admin dashboards love GraphQL; external integrators usually want REST. Same service layer behind both.
- **BullMQ over Inngest/Temporal at this stage.** Self-hosted, predictable, no external dependency beyond Redis. Reach for Inngest or Temporal when you have many workflows with complex state machines, not before.
- **class-validator + DTOs over Zod.** Native to Nest's pipe system, less custom wiring. Zod is more flexible if you're already standardised on it elsewhere — both work.

## Skills paired with this spec

- `api-designer` — REST + GraphQL conventions tuned for the Nest module layout
- `test-writer` — Jest + supertest patterns for controllers, resolvers, and services
- `openapi-spec` — generates and reviews the auto-published OpenAPI document
- `security-auditor` — JWT, refresh, OAuth, and dependency audits

Install individually with `npx specdriven add skill <slug>`, or accept them all when you install this spec.

## When this spec is the wrong fit

- **Pure REST CRUD with no team scaling pressure.** A leaner Fastify or Hono service is a better match.
- **Edge runtime / serverless cold starts dominate.** Nest's startup cost is real — use Hono on Cloudflare Workers or similar.
- **You want SSR rendering colocated with API.** Use `nextjs-saas` or `t3-stack`.
- **Python or Go ecosystem.** Use `fastapi-service`, `django-api`, or `go-service`.

If you'll have multiple feature teams touching the same backend, this spec is the right structure to start with.
