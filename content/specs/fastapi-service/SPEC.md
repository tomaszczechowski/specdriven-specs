---
name: fastapi-service
description: "Async REST API with FastAPI, Alembic migrations, Redis caching, and background tasks."
---

## What's included

A production-grade async REST API built on **FastAPI 0.111** with **PostgreSQL 16** persistence via **SQLAlchemy 2.0** (async engine, `asyncpg` driver) and **Alembic** for schema migrations. **Redis 7** handles response caching and **Celery 5** task queuing with **Flower** for real-time task monitoring. The spec ships with **Docker Compose** for local development and a multi-stage **Dockerfile** that produces a sub-200 MB production image using `python:3.12-slim`.

Authentication uses **JWT bearer tokens** (HS256 by default, configurable to RS256) with refresh token rotation and token-family invalidation on suspected reuse. **Rate limiting** is applied per-endpoint and per-user-tier via a Redis-backed `slowapi` middleware. All endpoints return consistent error envelopes conforming to **RFC 9457 Problem Details** — including validation errors, which FastAPI's default 422 response does not fully conform to.

**Pydantic v2** powers all request and response models. **OpenAPI 3.1** documentation is auto-generated and served at `/docs` (Swagger UI) and `/redoc`.

## Architecture

**Layered structure with dependency injection.** Route handlers are thin; business logic lives in services; database access is in repositories. FastAPI's `Depends` system wires everything together with no DI framework.

```python
# api/routers/users.py
@router.post("/", response_model=UserResponse, status_code=201)
async def create_user(
    body: CreateUserRequest,
    svc: Annotated[UserService, Depends(get_user_service)],
    _: Annotated[None, Depends(rate_limit("10/minute"))],
) -> UserResponse:
    return await svc.create(body)
```

```python
# api/services/users.py
class UserService:
    def __init__(self, repo: UserRepository, events: EventBus) -> None:
        self._repo = repo
        self._events = events

    async def create(self, data: CreateUserRequest) -> UserResponse:
        if await self._repo.email_exists(data.email):
            raise ConflictError("email_taken", f"Email {data.email!r} is already registered")
        user = await self._repo.create(data)
        await self._events.publish(UserCreated(user_id=user.id))
        return UserResponse.model_validate(user)
```

**Repositories accept an injected `AsyncSession`; they never create sessions themselves.** The session is committed or rolled back in the service layer, not in the router or repository. Repository methods read and write SQLAlchemy Core expressions — services work in domain terms, not ORM query terms.

**Background tasks use Celery, not FastAPI's `BackgroundTasks`.** FastAPI's built-in background tasks run in the same process — they block if they error and share memory with the web worker. Celery tasks have explicit retry policies, dead-letter queues, and can run on separate worker machines.

```python
# tasks/email.py
@celery_app.task(bind=True, max_retries=3, default_retry_delay=60)
def send_welcome_email(self, user_id: str) -> None:
    try:
        user = UserRepository().get(user_id)
        EmailService().send_welcome(user.email, user.name)
    except SMTPException as exc:
        raise self.retry(exc=exc)
```

**Error handling is centralised.** Domain errors (`ConflictError`, `NotFoundError`, `ValidationError`) extend a `ServiceError` base class with `code`, `status`, and `detail` fields. A single `@app.exception_handler(ServiceError)` maps them to RFC 9457 Problem Details responses. Handlers never import `HTTPException`.

## File structure

```
api/
├── main.py                Application factory, lifespan events
├── routers/
│   ├── __init__.py        APIRouter mounting
│   ├── users.py
│   ├── auth.py
│   └── health.py          /health/live + /health/ready
├── services/              Business logic
│   ├── users.py
│   └── auth.py
├── repositories/          Database access (SQLAlchemy 2.0 async)
│   ├── base.py            BaseRepository with common query helpers
│   └── users.py
├── schemas/               Pydantic v2 request/response models
│   ├── users.py
│   └── errors.py          RFC 9457 ProblemDetail model
├── models/                SQLAlchemy ORM models
│   └── users.py
├── errors.py              Domain error hierarchy
├── deps.py                FastAPI Depends providers
└── middleware/
    ├── rate_limit.py      slowapi configuration
    └── logging.py         structlog request context middleware

tasks/
├── celery.py              Celery app and configuration
├── email.py               Welcome emails, password reset
└── webhooks.py            Outbound webhook delivery with retries

alembic/
├── env.py
└── versions/              Migration files (checked into git)

tests/
├── conftest.py            Async test DB, fakeredis, app fixture
├── test_users.py          Integration tests against real Postgres
└── test_tasks.py          Celery task tests in eager mode

docker-compose.yml         postgres, redis, celery worker, flower
Dockerfile                 Multi-stage: builder → runtime (slim)
.env.example
pyproject.toml             Dependencies managed with uv
```

## Getting started

```bash
# 1. Scaffold the project
npx specdriven add spec fastapi-service

# 2. Configure
cp .env.example .env
# Set: DATABASE_URL, REDIS_URL, SECRET_KEY (openssl rand -hex 32), JWT_ALGORITHM

# 3. Start dependencies
docker compose up -d postgres redis

# 4. Apply migrations
uv run alembic upgrade head

# 5. Run the API
uv run uvicorn api.main:app --reload   # http://localhost:8000/docs

# 6. Start Celery worker (separate terminal)
uv run celery -A tasks.celery worker --loglevel=info

# 7. Run tests
uv run pytest                          # full suite against real Postgres
uv run pytest -m unit                  # unit-only (no DB, fast)
```

Flower (task monitoring UI) is available at `http://localhost:5555` when started with `docker compose up -d flower`.

## Opinionated choices, with reasons

- **FastAPI over Flask or Django REST Framework.** Async-native, Pydantic validation out of the box, OpenAPI auto-generation, and dependency injection built-in. Flask is synchronous by default and requires extensions for all of these. DRF is excellent but couples you to Django's ORM and synchronous request cycle. FastAPI is the right default for new Python APIs.
- **SQLAlchemy 2.0 async over Tortoise ORM or the `databases` library.** SQLAlchemy's async support is mature and backed by `asyncpg`; Alembic is the industry standard for migrations. Tortoise is Django-like but younger. The raw `databases` library is leaner but has no ORM mapping story.
- **asyncpg driver over psycopg3.** asyncpg is faster on high-concurrency read workloads due to its sans-I/O protocol parser. Switch to psycopg3 if you need LISTEN/NOTIFY or high-throughput `COPY` — its async support for those features is more complete.
- **Celery over ARQ or Dramatiq.** Celery has the largest ecosystem (Flower, celery-beat for schedules, monitoring integrations), the most production experience, and the clearest retry and dead-letter semantics. ARQ is leaner (Redis-only, no broker abstraction) and worth considering if you want to avoid Celery's complexity entirely.
- **slowapi over fastapi-limiter.** Based on the `limits` library with a Redis backend, minimal setup, and active maintenance. Works as both a decorator and a `Depends` provider. Extend with a custom middleware if you need sliding-window or token-bucket algorithms.
- **uv over pip + venv.** 10–100x faster dependency resolution, lockfile support, and reproducible installs. Fully compatible with `pyproject.toml`. No reason not to use it on new projects.
- **RFC 9457 Problem Details for errors.** Gives consumers a machine-readable `type` URI they can branch on, rather than string-matching `detail` messages. Required by several public API standards. Adds almost no implementation cost.

## Testing strategy

**Integration tests** use `pytest-asyncio` + `httpx.AsyncClient` against a real PostgreSQL instance (booted from `docker-compose.yml` in CI). Each test runs inside a transaction that is rolled back after the test, so tests are isolated without truncating tables. Redis is replaced with `fakeredis` to keep tests deterministic.

**Unit tests** cover service methods with repositories mocked via `unittest.mock.AsyncMock`. These run with no external dependencies and are tagged `@pytest.mark.unit` for fast local feedback.

**Contract tests** verify that the OpenAPI schema has not changed in backwards-incompatible ways using `schemathesis` for property-based API testing against the running development server.

## Skills paired with this spec

- `api-designer` — REST conventions, pagination design, and error envelope standards
- `test-writer` — pytest-asyncio patterns, integration test fixtures, and Celery task test strategies
- `security-auditor` — JWT implementation review, rate-limit bypass analysis, and dependency vulnerability audits

Install individually with `npx specdriven add skill <slug>`, or accept them all when you install this spec.

## When this spec is the wrong fit

- **Django ecosystem.** If you need Django admin, `django-allauth`, or are already in a Django project, use `django-api`. FastAPI has no equivalent to Django's admin UI or its batteries-included auth system.
- **Synchronous-only codebase.** If all your dependencies are synchronous, a sync FastAPI or Flask setup is simpler than mixing async and sync execution. FastAPI's async benefits disappear when you block the event loop with sync I/O.
- **Node.js team.** Use `nestjs-api`. Language and tooling ecosystem familiarity matters as much as the framework choice.
- **Serverless deployment target.** FastAPI can run on Lambda via Mangum but cold starts and the async event loop interact poorly at low traffic volumes. Consider a Lambda-optimised ASGI handler or AWS Lambda Powertools for Python instead.
