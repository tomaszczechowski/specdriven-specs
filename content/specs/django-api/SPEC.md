---
name: django-api
description: Production Django REST Framework API - DRF, Celery, Redis, drf-spectacular, pytest, gunicorn.
---

## What's included

A batteries-included Python backend built on **Django 5** and **Django REST Framework**, the combination that still powers a large share of production Python APIs. **PostgreSQL** as the database (via `psycopg[binary]`), **Celery** + **Redis** for background tasks and scheduled jobs, **drf-spectacular** for an auto-generated OpenAPI 3.1 schema and Swagger UI. **Token-based authentication** with both DRF tokens and **SimpleJWT** wired (pick per project). **django-environ** for typed environment configuration that fails loudly on bad input.

Tests run on **pytest-django** with **factory-boy** fixtures and **pytest-xdist** for parallel runs. **ruff** for linting and formatting, **mypy** with `django-stubs` and `djangorestframework-stubs` for the type checks Django itself doesn't enforce. Production is **gunicorn** behind **nginx** (or behind a managed load balancer), **whitenoise** for static assets, **structlog** for structured JSON logging with request IDs, **Sentry** for error tracking, **django-prometheus** for `/metrics`.

This is the project blueprint for "I want a typed, well-tested Python API with an admin out of the box and a path to grow into a multi-team codebase."

## Architecture

**Apps are feature modules.** Each Django app (`users`, `billing`, `webhooks`) owns its models, serializers, views, services, tasks, and tests. Cross-app imports go through service-layer functions, not direct model imports. An app can be developed, tested, and reviewed in isolation.

**ViewSets for CRUD, APIViews for everything else.** DRF `ModelViewSet` covers the standard cases. For non-CRUD endpoints (webhooks, custom actions, aggregations, file uploads), drop down to `APIView` — don't force them through ViewSet machinery. Filtering uses **django-filter** with explicit `filterset_fields`; ordering is declared per ViewSet, never wildcarded.

**Services live in `services.py`.** Business logic is plain functions that take primitive arguments and return data:

```python
# users/services.py
def create_user(*, email: str, password: str, name: str) -> User:
    if User.objects.filter(email=email).exists():
        raise UserAlreadyExistsError(email)

    user = User.objects.create_user(email=email, password=password, name=name)
    send_welcome_email.delay(user.id)  # idempotent celery task
    return user
```

Views call services. Tests call services directly. Logic is never inside a serializer's `create()`/`update()` or a view method. Serializers are for shape; services are for behaviour.

**Permissions are explicit per ViewSet.** Each ViewSet declares its `permission_classes` and, where needed, an `IsObjectOwner` permission that checks the row belongs to the requester. Object permissions are tested per view in the test suite — a missing `IsObjectOwner` is a security bug, not a refactoring nuance

**Celery tasks are idempotent and small.** Each task does one thing. Heavy workflows are chains (`task.s() | task.s()`) or chords, not monolithic functions. Tasks accept primitive arguments (IDs, not model instances) so they survive serialization through Redis:

```python
@shared_task(bind=True, max_retries=5, default_retry_delay=60, autoretry_for=(SoftTimeLimitExceeded,))
def send_welcome_email(self, user_id: int):
    user = User.objects.get(pk=user_id)
    EmailSendAttempt.objects.get_or_create(  # idempotency
        user=user, template='welcome', key=f'welcome:{user_id}',
        defaults={'status': 'pending'},
    )
    ...
```

Idempotency is enforced by a unique constraint on `EmailSendAttempt(user, template, key)`. Failed tasks land in a dead-letter queue after retries.

**Migrations are sacred.** Every schema change ships a migration; nobody runs `--fake` in CI. `python manage.py makemigrations --check --dry-run` is a required test. Data migrations are separate from schema migrations and use `RunPython` with reversible functions.

**Configuration validates at boot.** `django-environ` reads `.env`, then a `config/settings/checks.py` module asserts required keys are present and well-formed (URL, length, secret entropy). Django boots fail with a readable error rather than producing a 500 on the first request.

**Logging is structured.** `structlog` produces JSON logs in production with request ID (from middleware), user ID, view name, and elapsed time. A custom middleware adds the request ID to the response header so clients and logs can be cross-referenced.

## File structure

```
config/
├── settings/
│   ├── base.py              Defaults shared across environments
│   ├── development.py       DEBUG = True, console email, ...
│   ├── production.py        DEBUG = False, strict cookies, secure headers
│   └── checks.py            Boot-time env validation
├── urls.py                  Root URL conf
├── celery.py                Celery app factory
├── asgi.py                  Async entry (channels-ready)
└── wsgi.py                  Sync entry (gunicorn)

apps/
├── users/                   Example feature app
│   ├── __init__.py
│   ├── apps.py
│   ├── models.py
│   ├── managers.py          Custom managers + QuerySets
│   ├── serializers.py
│   ├── services.py
│   ├── permissions.py
│   ├── views.py
│   ├── urls.py
│   ├── tasks.py             Celery tasks
│   ├── admin.py
│   ├── migrations/
│   └── tests/
│       ├── conftest.py      App-scoped fixtures
│       ├── factories.py     factory-boy factories
│       ├── test_services.py
│       ├── test_views.py
│       └── test_permissions.py
└── ...

common/
├── pagination.py            CursorPagination subclass with sane defaults
├── permissions.py           IsOwner, IsOrgMember
├── exceptions.py            Custom DRF exception handler
├── middleware/
│   ├── request_id.py        Adds X-Request-ID to logs + response
│   └── access_log.py        Structured access log per request
└── throttling.py            Custom throttle classes

requirements/
├── base.txt
├── development.txt          + pytest, ruff, mypy, factory-boy
└── production.txt           + gunicorn, whitenoise, structlog, sentry-sdk

tests/
├── conftest.py              Project-wide fixtures
└── integration/             Cross-app integration scenarios
```

## Getting started

```bash
# 1. Scaffold the project
npx specdriven add spec django-api

# 2. Configure
cd .claude/specs/django-api
cp env.example.txt .env

# 3. Set the required values
#    - DATABASE_URL                Postgres
#    - REDIS_URL                   Celery broker + result backend
#    - SECRET_KEY                  django-environ; openssl rand -base64 32
#    - ALLOWED_HOSTS               comma-separated
#    - SENTRY_DSN                  optional

# 4. Install and migrate
python -m venv .venv && source .venv/bin/activate
pip install -r requirements/development.txt
python manage.py migrate
python manage.py createsuperuser

# 5. Run API and worker (separate processes)
python manage.py runserver           # http://localhost:8000
celery -A config worker -l info      # in another terminal
celery -A config beat -l info        # scheduled tasks (third terminal, optional)
```

Swagger UI at `/api/schema/swagger-ui/`, raw OpenAPI at `/api/schema/`, Django admin at `/admin/`, Prometheus metrics at `/metrics`.

## Opinionated choices, with reasons

- **Django + DRF over FastAPI.** Django ships an admin, an ORM with mature migrations, a battle-tested auth system, and 20 years of community packages. FastAPI is leaner and faster but gives you nothing for CRUD on day one — by the time you've added an ORM, migrations, an admin, and auth, you've reinvented Django badly. Use `fastapi-service` for slim async APIs and gateways, `django-api` for product APIs with a back office.
- **Celery over RQ, Dramatiq, or Huey.** Mature, well-documented, the default for a reason. Has the broadest cloud and observability integration. RQ is simpler but its feature set runs out quickly; Dramatiq is solid but a smaller community.
- **drf-spectacular over drf-yasg.** Actively maintained, OpenAPI 3.1, better serializer + viewset support, plays well with `mypy`. drf-yasg is in maintenance mode and stuck on OpenAPI 2.
- **pytest-django over Django's `manage.py test`.** Fixtures are better, parametrisation is cleaner, watch mode works (`pytest-watch`), parallelisation via `pytest-xdist` is one flag. Django's runner is fine for tiny projects; pytest scales.
- **mypy + django-stubs + djangorestframework-stubs.** Catches the queryset-vs-list bugs Django itself misses, types serializer `validated_data`, and surfaces ViewSet/Serializer mismatches at lint time. The setup pays off after a thousand lines of code.
- **ruff over black + flake8 + isort + pyupgrade.** One tool, faster than any of them, handles all four jobs. The configuration lives in `pyproject.toml`.
- **CursorPagination over PageNumberPagination.** Stable under inserts, no `OFFSET` performance cliff. Page-number pagination is fine for an admin; cursor is the right default for an API.
- **JWT with SimpleJWT *or* DRF tokens — not both.** Pick one per project. JWT for stateless multi-service auth, DRF tokens for single-monolith auth. Mixing them confuses everyone.
- **psycopg 3 (`psycopg[binary]`) over psycopg2.** psycopg2 is in maintenance only; psycopg 3 is the future of Postgres in Python.

## Testing strategy

**Unit tests** target services and managers directly. They use `pytest-django`'s `db` fixture (transactional, rolled back per test) and `factory-boy` factories for fixtures. Tests are colocated with the code (`apps/users/tests/test_services.py`).

**View tests** use the DRF `APIClient` and exercise the URL → ViewSet → service path. Each protected endpoint has at least one test that asserts a `403` for the wrong user and a `2xx` for the right user.

**Permission tests** exist per ViewSet — a missing object permission is a security defect, and a regression test prevents it from coming back.

**Integration tests** in `tests/integration/` exercise cross-app flows (e.g. "creating an organisation also creates the owner's membership and seeds the default plan"). They're slower; they don't run on every commit, but they do run before merge.

**Migration tests** use `pytest-django-migrations` to verify a migration runs forward and backward on a populated database.

## Skills paired with this spec

- `api-designer` — DRF ViewSet + serializer conventions and pagination patterns
- `test-writer` — pytest-django + factory-boy patterns, including permission tests
- `openapi-spec` — drf-spectacular schema review, tweaking decorators for accurate auto-generation
- `security-auditor` — DRF permissions, CSRF (for browser endpoints), dependency audits, secrets hygiene

Install individually with `npx specdriven add skill <slug>`, or accept them all when you install this spec.

## When this spec is the wrong fit

- **Pure async streaming API or websocket-heavy app.** Django supports it via Channels, but FastAPI is built for it. Use `fastapi-service`.
- **No need for an admin or relational data.** A FastAPI service is half the code and half the moving parts.
- **Node.js or Go ecosystem.** Use `nestjs-api` or `go-service`.
- **Tiny microservice.** Django boots take seconds; for small services a Go binary or a Hono Worker is more honest about the size of the problem.
- **You hate the active-record pattern.** Django's ORM is fundamentally an active-record. If you want repository-style data access without fighting the framework, pick something else.

If you want a Python backend that will still make sense to a new hire two years from now, this spec is the right shape.
