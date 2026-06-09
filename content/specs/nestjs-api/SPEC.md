---
name: nestjs-api
description: Production NestJS API template - REST + GraphQL, Prisma, Passport JWT, BullMQ jobs, OpenTelemetry.
---

## What's included

A modular Node.js backend built on **NestJS 10**, structured around feature modules and dependency injection. Exposes both **REST controllers** and an **Apollo GraphQL** endpoint from the same service layer — pick the transport per feature, not for the whole app. Persistence via **Prisma** with migrations checked into git. Authentication via **Passport JWT** with refresh tokens and OAuth (GitHub, Google) ready to wire up. Background jobs via **BullMQ** with a dedicated worker process. Observability via **OpenTelemetry** with auto-instrumentation for HTTP, Prisma, and BullMQ; metrics emitted in Prometheus format on `/metrics`.

Validation uses **class-validator** + **class-transformer** on DTOs, enforced by a global `ValidationPipe`. Errors are mapped to consistent HTTP responses (REST) and `GraphQLError` extensions (GraphQL) by a single exception filter. Configuration loads from environment via `@nestjs/config` with Zod-validated schemas — boot fails loudly if env is malformed. Rate limiting via `@nestjs/throttler`, idempotency keys on mutations, request IDs propagated through logs and traces.

This is the project blueprint for "I need a typed, modular backend with clean boundaries that scales past one team without rewrites."

## Architecture

**Modules are the unit of feature ownership.** Each feature (`users`, `billing`, `webhooks`) is a Nest module that exports a controller, a GraphQL resolver, a service, a repository, and tests. Modules import only what they need; a circular dependency is a failed build, not a `forwardRef` afterthought. There is no `SharedModule` of unrelated helpers.

**Service layer is transport-agnostic.** Controllers and GraphQL resolvers are thin — they parse input, call the service, return the result:

```ts
// users.controller.ts
@Post()
async create(@Body() dto: CreateUserDto, @CurrentUser() actor: AuthUser) {
  return this.users.create(dto, actor);
}

// users.resolver.ts
@Mutation(() => User)
createUser(@Args('input') dto: CreateUserDto, @CurrentUser() actor: AuthUser) {
  return this.users.create(dto, actor);
}
```

The same `UserService.create(...)` is also callable from a BullMQ worker. Business logic has no knowledge of HTTP or GraphQL.

**Prisma + repository pattern, lightly.** Services depend on a per-feature repository (`UserRepository`) that wraps Prisma. This isn't heavy DDD — the repository exists so you can mock it in tests and so service code reads in domain terms (`repo.findActiveByTenant(tenantId)`) rather than Prisma query terms. Repositories never leak Prisma types; they return domain entities.

**Jobs are first-class, not afterthoughts.** BullMQ queues live alongside the modules that own them. The worker process boots a `WorkerModule` that imports only the feature modules whose jobs it handles — not the entire app — so the worker has a smaller startup cost and a clearer dependency surface. Queues have explicit retry policies (exponential backoff, max 5 attempts), dead-letter handling (failed jobs after retries land in a `failed` queue inspected by a job dashboard), and BullBoard mounted at `/admin/queues` behind admin auth.

**Errors are typed and mapped centrally.** Domain errors are plain classes that extend `DomainError`:

```ts
export class UserAlreadyExistsError extends DomainError {
  readonly code = 'USER_ALREADY_EXISTS';
  readonly status = 409;
  constructor(email: string) {
    super(`User with email ${email} already exists`);
  }
}
```

A single `AllExceptionsFilter` maps domain errors to HTTP status + JSON body or GraphQL `extensions`. Controllers never call `throw new HttpException`. Unhandled errors get a request ID in the response body and a full trace in logs.

**Observability is wired, not bolted on.** OpenTelemetry SDK initialises before any other import (in `tracing.ts` loaded via `--require`). Spans are created automatically for HTTP, GraphQL, Prisma, BullMQ, Redis, and outgoing HTTP. Each request gets a request ID propagated through `cls-hooked` into logs, error responses, and BullMQ job metadata. `pino` is the logger; logs are JSON in production, pretty in development.

**Configuration validates at boot.** `@nestjs/config` loads `.env`, then a Zod schema validates and types it. Boot fails with a readable error if `DATABASE_URL` is missing or `JWT_SECRET` is shorter than 32 chars. There is no "runtime env lookup that fails at first request."

## File structure

```
src/
├── main.ts                  HTTP + GraphQL bootstrap, graceful shutdown
├── worker.ts                BullMQ worker process entry
├── tracing.ts               OTel SDK init (loaded via --require)
├── app.module.ts            Root module: imports all features
├── config/
│   ├── schema.ts            Zod env schema
│   └── config.module.ts     ConfigModule with validation
├── common/
│   ├── filters/             AllExceptionsFilter
│   ├── guards/              JwtAuthGuard, RolesGuard, ThrottlerGuard
│   ├── interceptors/        LoggingInterceptor, TimeoutInterceptor
│   ├── decorators/          @CurrentUser, @Public, @Roles
│   ├── errors/              DomainError base + concrete subclasses
│   └── pipes/               ZodValidationPipe (for non-class-validator usage)
├── auth/                    Passport JWT + refresh + OAuth strategies
│   ├── auth.controller.ts
│   ├── auth.service.ts
│   ├── strategies/
│   │   ├── jwt.strategy.ts
│   │   └── github.strategy.ts
│   └── tokens.service.ts    Issue + verify + rotate refresh tokens
├── users/                   Example feature module
│   ├── users.module.ts
│   ├── users.controller.ts
│   ├── users.resolver.ts
│   ├── users.service.ts
│   ├── users.repository.ts
│   ├── dto/
│   │   ├── create-user.dto.ts
│   │   └── update-user.dto.ts
│   ├── entities/
│   │   └── user.entity.ts
│   └── users.service.spec.ts
└── jobs/
    ├── jobs.module.ts       Shared BullMQ setup
    └── send-welcome-email.processor.ts

prisma/
├── schema.prisma            Single source of truth
├── migrations/              Generated SQL, checked into git
└── seed.ts                  Idempotent seed for local dev

test/
├── e2e/                     Supertest against a booted app
└── fixtures/                Factory functions for test data
```

## Getting started

```bash
# 1. Scaffold the project
npx specdriven add spec nestjs-api

# 2. Install and configure
cd .claude/specs/nestjs-api
cp env.example.txt .env

# 3. Set the required values
#    - DATABASE_URL                Postgres
#    - REDIS_URL                   for BullMQ + sessions
#    - JWT_SECRET                  openssl rand -base64 32
#    - JWT_REFRESH_SECRET          openssl rand -base64 32
#    - GITHUB_CLIENT_ID / SECRET   optional OAuth
#    - OTEL_EXPORTER_OTLP_ENDPOINT optional; empty disables tracing

# 4. Apply migrations and seed
pnpm install
pnpm prisma migrate dev
pnpm db:seed

# 5. Run API and worker (separate processes, same code)
pnpm dev:api      # http://localhost:3000  + /graphql + /docs
pnpm dev:worker   # consumes BullMQ queues
```

GraphQL Playground at `/graphql` in development. OpenAPI/Swagger UI at `/docs` (built from controllers via `@nestjs/swagger`). BullBoard at `/admin/queues` (behind admin auth in production).

## Opinionated choices, with reasons

- **NestJS over Express/Fastify directly.** Modules, DI, pipes, guards, and interceptors give you a real architecture from day one. Yes, it's heavier — but the bigger the team and the longer the codebase lives, the more that structure pays off. For 200-line APIs, use Fastify directly; for anything that will outlive a single developer, the Nest scaffolding earns its weight.
- **Prisma over TypeORM, Drizzle, or Kysely.** Best-in-class developer ergonomics for Node + relational databases, mature migration tooling, the most stable type generation. Drizzle is leaner but the ecosystem is younger; Kysely is fantastic for query-builder fans but lacks the migration story. TypeORM is in maintenance and pre-dates async TypeScript ergonomics.
- **GraphQL co-located with REST.** Don't force every consumer through one transport. Internal admin dashboards love GraphQL; external integrators usually want REST. Same service layer behind both means no logic duplication.
- **BullMQ over Inngest, Temporal, or Trigger.dev at this stage.** Self-hosted, predictable, no external dependency beyond Redis. Reach for Inngest or Temporal when you have many workflows with complex state machines or you genuinely need durable execution — not before. Most "we need workflows" turns out to be "we need a queue with retries."
- **class-validator + DTOs over Zod everywhere.** Native to Nest's pipe system (one decorator and the request body is validated), less custom wiring, plays well with `@nestjs/swagger` for OpenAPI generation. Zod is more flexible if you're already standardised on it elsewhere — both work, but pick one per project.
- **pino over winston.** Faster, JSON by default, integrates cleanly with OpenTelemetry and cloud log aggregators. Winston is more configurable than anyone needs.
- **Passport over building auth from scratch.** Strategies for JWT, OAuth providers, and SAML are off-the-shelf. The Nest integration is mature. Roll your own only if you need something exotic.

## Testing strategy

**Unit tests** cover services with the repository mocked. Repositories themselves are tested against a real Postgres using a transaction-per-test wrapper that rolls back after each test — no shared state between tests, no fixtures hanging around.

**E2E tests** use Supertest against a booted NestJS app, with a per-test Postgres schema or a wrapped transaction. They cover the happy path of each controller and each guard's enforcement (a `403` test for every protected endpoint).

**Contract tests** between the service and BullMQ jobs use a real Redis (testcontainers-go-style, but in Node) so retry policies and dead-letter behaviour get exercised in CI, not in production at 3am.

## Skills paired with this spec

- `api-designer` — REST + GraphQL conventions tuned for the Nest module layout
- `test-writer` — Jest + Supertest patterns for controllers, resolvers, services, and repositories
- `openapi-spec` — generates and reviews the auto-published OpenAPI document
- `security-auditor` — JWT, refresh, OAuth, rate limiting, and dependency audits

Install individually with `npx specdriven add skill <slug>`, or accept them all when you install this spec.

## When this spec is the wrong fit

- **Pure REST CRUD with no team-scaling pressure.** A leaner Fastify or Hono service is a better match — Nest's structure is overhead when nobody is going to touch the code after you.
- **Edge runtime / serverless cold starts dominate.** Nest's startup cost is real and can't be avoided. Use Hono on Cloudflare Workers, or AWS Lambda with the Fastify adapter and aggressive code-splitting.
- **You want SSR colocated with the API.** Use `nextjs-saas` or `t3-stack`.
- **Python or Go ecosystem.** Use `fastapi-service`, `django-api`, or `go-service`.
- **You're building a thin BFF in front of microservices.** Nest works but is heavier than the use case warrants — `fastapi-service` or a Hono BFF will boot faster and be easier to redeploy on every change upstream.

If you'll have multiple feature teams touching the same backend and want guards, pipes, and DI as your baseline contract, this spec is the right structure to start with.
