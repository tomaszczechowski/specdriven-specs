---
name: go-service
description: Production Go HTTP service - chi router, sqlc, structured logging, graceful shutdown, OpenTelemetry.
---

## What's included

A production-shaped Go service that's small enough to read in one sitting and structured enough to scale to dozens of endpoints. **chi** for routing, **sqlc** for type-safe SQL (no ORM), **pgx/v5** for the PostgreSQL driver, **slog** for structured logging, **OpenTelemetry** for tracing and metrics, **golang-migrate** for database migrations. Configuration via environment variables parsed at boot with a strict schema that fails loudly when something is wrong. Graceful shutdown on `SIGTERM` with a configurable drain window for in-flight requests; readiness and liveness probes match the shutdown sequence so Kubernetes can pull traffic before the process stops accepting.

Tests use the standard library plus **testcontainers-go** to spin up real Postgres for integration tests — no mocks of the database. **golangci-lint** runs a curated linter set (`errcheck`, `gocritic`, `revive`, `staticcheck`, plus a few project-specific ones). Container builds use distroless base images for minimal attack surface. CI builds multi-arch (`linux/amd64`, `linux/arm64`).

This is the project blueprint for "I want a fast, boring, observable HTTP service that I can deploy anywhere and trust at 3am."

## Architecture

**Flat package layout, no `internal/` cargo cult.** `cmd/server` is the entry point. `handler/`, `service/`, `store/`, `auth/`, `config/`, `observability/` are the major packages. No `internal/pkg/lib/util/common`. Each package owns one concern and exposes the minimum surface — most packages export a single struct and a constructor.

**Dependency wiring lives in `cmd/server/main.go`, not in `init()`.** The entry point reads config, opens the database, builds the OTel pipeline, constructs the services, mounts the router, and starts the HTTP server. Every dependency is explicit:

```go
db, err := pgxpool.New(ctx, cfg.DatabaseURL)
queries := store.New(db)
userSvc := service.NewUser(queries, logger)
h := handler.New(userSvc, logger)

r := chi.NewRouter()
r.Use(observability.HTTPMiddleware(tracer, logger))
r.Mount("/api", h.Routes())
```

No DI framework, no global state, no `init()` side effects. Test code wires the same dependencies with test doubles.

**sqlc generates the query layer.** SQL queries live in `query/*.sql` with `-- name:` annotations and Postgres-typed result columns. `go generate` produces typed Go functions that take request structs and return result structs:

```sql
-- name: GetActiveSubscription :one
SELECT id, user_id, plan_id, status, current_period_end
FROM subscriptions
WHERE user_id = $1 AND status = 'active'
LIMIT 1;
```

becomes a `Queries.GetActiveSubscription(ctx, userID)` function. No reflection, no query builder, no surprises at runtime. Custom wrappers in `store/` add transactional helpers and pagination on top.

**Handlers are skinny, services do the work.** Handlers parse the request, call a service, write the response:

```go
func (h *Handler) createUser(w http.ResponseWriter, r *http.Request) {
    var req CreateUserRequest
    if err := decodeJSON(r, &req); err != nil { writeError(w, err); return }

    user, err := h.users.Create(r.Context(), req.toDomain())
    if err != nil { writeError(w, err); return }

    writeJSON(w, http.StatusCreated, fromDomain(user))
}
```

Business logic never sees `http.ResponseWriter`. Testing handlers requires almost no mocking because handlers do almost nothing — services are where the real tests live.

**Errors are values with kinds.** The `errs` package defines an `Error` struct with a `Kind` (`NotFound`, `Conflict`, `Validation`, `Unauthorized`, `Internal`), a code, and the underlying cause. A central `writeError` helper maps the kind to a status code and JSON body. Handlers `return err`, never call `http.Error` directly. Errors wrap with `fmt.Errorf("...: %w", err)` so `errors.Is` and `errors.As` work end-to-end.

**Context propagation everywhere.** Every function that does I/O takes `ctx context.Context` as its first argument. Request context flows from the router through the service into the database driver, so cancellation and deadlines work — a client disconnect cancels the in-flight Postgres query, not the other way around. The request ID, trace ID, and authenticated user are pulled out of context, never passed as separate arguments.

**Observability is set up before the server starts.** OTel SDK initialises with OTLP exporters for traces and metrics. The HTTP middleware creates a server span per request, propagates W3C TraceContext headers, and adds `http.status_code`, `http.route` (the chi-matched pattern, not the raw URL), and `request_id` attributes. Database calls are auto-instrumented via the pgx OTel hook. Logs include `trace_id` and `span_id` so a log line links straight to a trace.

## File structure

```
cmd/
└── server/
    └── main.go              Entry point: wire deps, start HTTP, graceful shutdown

handler/                     HTTP handlers (one file per resource)
├── handler.go               Handler struct, Routes() method
├── users.go
├── subscriptions.go
├── decode.go                decodeJSON, decodePathID helpers
└── write.go                 writeJSON, writeError helpers

service/                     Business logic (transport-agnostic)
├── user.go
└── subscription.go

store/                       sqlc-generated query layer + custom wrappers
├── queries.sql.go           generated
├── models.sql.go            generated
├── tx.go                    WithTx helper for transactional services
└── pagination.go            Keyset pagination helpers

query/                       *.sql files (sqlc source)
├── users.sql
└── subscriptions.sql

auth/                        JWT verification middleware + helpers
config/                      Environment parsing + validation
errs/                        Error kinds + writeError mapping
observability/               OTel + slog setup, HTTP + DB middleware

migrations/                  golang-migrate SQL files (up/down pairs)

test/
├── integration/             testcontainers-backed tests
├── fixtures/                Factory functions for test data
└── load/                    k6 scripts (optional)

Dockerfile                   Distroless multi-stage build
Makefile                     Common tasks: tools, generate, migrate, run, test
sqlc.yaml                    sqlc config
```

## Getting started

```bash
# 1. Scaffold the project
npx specdriven add spec go-service

# 2. Configure
cd .claude/specs/go-service
cp env.example.txt .env

# 3. Set the required values
#    - DATABASE_URL                Postgres
#    - JWT_PUBLIC_KEY              or JWKS_URL for hosted IdP
#    - OTEL_EXPORTER_OTLP_ENDPOINT optional
#    - LOG_LEVEL                   debug | info | warn | error

# 4. Install tooling
make tools         # installs sqlc, migrate, golangci-lint, gotestsum

# 5. Generate code
make generate      # runs sqlc; commits generated files

# 6. Migrate and run
make migrate-up
make run           # http://localhost:8080
```

`make test` runs unit tests. `make test-integration` boots a real Postgres via testcontainers and runs the integration suite. `make lint` runs golangci-lint with the project's strict config.

## Opinionated choices, with reasons

- **chi over Gin, Echo, or Fiber.** Standard `net/http` handler types — no framework lock-in, middleware composes idiomatically. Gin is fine but its custom context type is contagious and shows up in every helper. Echo and Fiber have similar issues. chi was designed for the stdlib, not against it.
- **sqlc over GORM, ent, or sqlx.** You write SQL, you get typed Go functions and structs. The query layer is auditable in the repo. ORMs work until they don't — then you fight them by dropping into raw queries half the time anyway. With sqlc, you just write SQL and never go back. ent is interesting but generates a lot of code; sqlc generates only what you ask for.
- **pgx/v5 over database/sql + lib/pq.** Faster, supports Postgres types natively (`uuid`, `jsonb`, `timestamptz`, arrays) without conversion, the connection pool is production-grade by default, and OpenTelemetry integration is first-class via a pgx hook.
- **slog over zap or zerolog.** It's in the standard library since Go 1.21 and the API is good. Zap is faster on paper; very few services care. slog also has the cleanest integration with OpenTelemetry's `slog` bridge.
- **testcontainers-go for integration tests.** Real Postgres beats mocks. Tests are slower but they catch real bugs: constraint violations, type mismatches, query mistakes, RLS policy gaps. The first integration test is the most expensive; every one after that is free.
- **Distroless container base.** Smaller attack surface (no shell, no package manager), faster pulls, fewer CVEs. The trade-off — no `kubectl exec` shell for debugging — is fixed with the right tracing and logs.
- **No DI framework.** `wire` and friends solve a problem you don't have at this size. Manual constructor wiring in `main.go` is one screen of code and exposes the full dependency graph.
- **errors.Is / errors.As over typed error returns.** Wrapping with `%w` is the canonical Go pattern. Sentinel errors (`errs.ErrNotFound`) work with `errors.Is`; structured errors work with `errors.As`. Both compose.

## Testing strategy

**Unit tests** cover services with the store interface mocked. Mocks are hand-written (interfaces in service packages have small surfaces) — no codegen, no gomock.

**Integration tests** spin up Postgres via testcontainers-go, apply migrations, and exercise the store + service together. The test container is shared across the test binary via `TestMain` to keep total runtime sane; each test runs in its own transaction that is rolled back at the end.

**HTTP tests** mount the chi router and use `httptest` to send real requests. They cover the happy path of each handler and the error path for each error kind. Auth middleware tests live next to the auth package.

**Load tests** in `test/load/` use k6 scripts to model realistic traffic. They are not in CI; they run on demand before a capacity change.

## Skills paired with this spec

- `code-reviewer` — review prompts tuned for idiomatic Go patterns (context, error wrapping, no global state)
- `test-writer` — table-driven tests + testcontainers conventions
- `api-designer` — REST conventions matched to the chi + handler layout
- `security-auditor` — JWT validation, SQL injection surface (sqlc removes most of it), container image audits, dependency audits

Install individually with `npx specdriven add skill <slug>`, or accept them all when you install this spec.

## When this spec is the wrong fit

- **You're a JavaScript shop with no Go expertise.** Use `nestjs-api` or `fastapi-service`. The language is the smaller half of the cost; the ecosystem familiarity is the bigger half.
- **You need GraphQL as the primary transport.** Possible in Go (gqlgen) but the Node ecosystem ships faster here.
- **The service is mostly orchestration with little CPU work.** Node's async I/O is usually enough; reach for Go when CPU, throughput, or memory really matter.
- **One-shot scripts or jobs.** Go works but the iteration loop is slower than Python; for ETL or analysis scripts, prefer `python-etl`.
- **You depend heavily on a managed ORM with a generator UI (Prisma Studio, Drizzle Studio).** Go's tooling is text-and-Makefile; if that's a deal-breaker, stay in Node.

If concurrency, throughput, predictable latency, and operational simplicity are what you're optimising for, this spec is the right shape.
