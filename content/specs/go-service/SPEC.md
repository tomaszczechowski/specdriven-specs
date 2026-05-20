---
name: go-service
description: Production Go HTTP service - chi router, sqlc, structured logging, graceful shutdown, OpenTelemetry.
---

## What's included

A production-shaped Go service that's small enough to read in one sitting and structured enough to scale to dozens of endpoints. **chi** for routing, **sqlc** for type-safe SQL (no ORM), **pgx** for the PostgreSQL driver, **slog** for structured logging, **OpenTelemetry** for tracing and metrics. Configuration via environment variables parsed at boot with a strict schema. Graceful shutdown on `SIGTERM` with a configurable drain window for in-flight requests.

Tests use the standard library plus **testcontainers-go** to spin up real Postgres for integration tests — no mocks of the database. **golangci-lint** runs the curated linter set; **staticcheck** catches the things `go vet` misses. Container builds use distroless base images for minimal attack surface.

This is the project blueprint for "I want a fast, boring, observable HTTP service that I can deploy anywhere and trust at 3am."

## Architecture

**Flat package layout, no `internal/` cargo cult.** `cmd/server` is the entry point. `handler/`, `store/`, `auth/`, `config/` are the major packages. No `internal/pkg/lib/util`. Each package owns one concern and exposes the minimum surface.

**sqlc generates the query layer.** SQL queries live in `query/*.sql` with `-- name:` annotations. `go generate` produces typed Go functions that take request structs and return result structs. No reflection, no query builder, no surprises at runtime.

**Handlers are skinny, services do the work.** Handlers parse the request, call a service, write the response. Business logic never sees `http.ResponseWriter`. Testing handlers requires almost no mocking because handlers do almost nothing.

**Errors are values with kinds.** A `Error` struct carries a `Kind` (`NotFound`, `Conflict`, `Validation`, `Internal`) and the underlying cause. A central `writeError` helper maps the kind to a status code and JSON body. Handlers `return err`, never call `http.Error` directly.

**Context propagation everywhere.** Every function that does I/O takes `ctx context.Context` as its first argument. Request context flows from the router through the service into the database driver, so cancellation and deadlines work end-to-end.

## File structure

```
cmd/
└── server/
    └── main.go              Entry point, dependency wiring, graceful shutdown

handler/                     HTTP handlers (one file per resource)
service/                     Business logic (transport-agnostic)
store/                       sqlc-generated query layer + custom wrappers
query/                       *.sql files (sqlc source)
auth/                        JWT verification, middleware
config/                      Environment parsing + validation
observability/               OTel setup, slog handler

migrations/                  golang-migrate SQL files

test/
├── integration/             testcontainers-backed tests
└── load/                    k6 scripts (optional)

Dockerfile                   Distroless multi-stage build
```

## Getting started

```bash
# 1. Scaffold the project
npx specdriven add spec go-service

# 2. Configure
cd .claude/specs/go-service
cp env.example.txt .env

# 3. Set the required values
#    - DATABASE_URL (Postgres)
#    - JWT_PUBLIC_KEY (or JWKS_URL for hosted IdP)
#    - OTEL_EXPORTER_OTLP_ENDPOINT (optional)

# 4. Install tools and generate sqlc
make tools         # installs sqlc, migrate, golangci-lint
make generate      # runs sqlc

# 5. Migrate and run
make migrate-up
make run
```

`make test` runs unit tests; `make test-integration` boots a real Postgres via testcontainers and runs the integration suite.

## Opinionated choices, with reasons

- **chi over Gin/Echo/Fiber.** Standard `net/http` handler types — no framework lock-in. Middleware composition is idiomatic. Gin is fine but its custom context type is contagious.
- **sqlc over GORM/ent.** You write SQL, you get types. The query layer is auditable in the repo. ORMs work until they don't — then you fight them. With sqlc, you just write SQL.
- **pgx over database/sql + lib/pq.** Faster, supports Postgres types natively (`uuid`, `jsonb`, `timestamptz`) without conversion. The connection pool is the production default.
- **slog over zap/zerolog.** It's in the standard library since Go 1.21 and the API is good. Zap is faster on paper; very few services care.
- **testcontainers-go for integration tests.** Real Postgres beats mocks. Tests are slower but they catch real bugs (constraint violations, type mismatches, query mistakes).
- **Distroless container base.** Smaller attack surface, faster pulls, no shell for an attacker to land in.

## Skills paired with this spec

- `code-reviewer` — review prompts tuned for idiomatic Go patterns
- `test-writer` — table-driven tests + testcontainers conventions
- `api-designer` — REST conventions matched to the chi + handler layout
- `security-auditor` — JWT validation, SQL injection surface, dependency audits

Install individually with `npx specdriven add skill <slug>`, or accept them all when you install this spec.

## When this spec is the wrong fit

- **You're a JavaScript shop with no Go expertise.** Use `nestjs-api` or `fastapi-service`.
- **You need GraphQL as the primary transport.** Possible in Go (gqlgen) but the Node ecosystem ships faster here.
- **The service is mostly orchestration with little CPU work.** Node's async I/O is usually enough; reach for Go when CPU, throughput, or memory really matter.
- **One-shot scripts or jobs.** Go works but the iteration loop is slower than Python.

If concurrency, throughput, and operational simplicity are what you're optimising for, this spec is the right shape.
