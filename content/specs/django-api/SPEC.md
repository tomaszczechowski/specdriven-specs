---
name: django-api
description: Production Django REST Framework API - DRF, Celery, Redis, drf-spectacular, pytest, gunicorn.
---

## What's included

A batteries-included Python backend built on **Django 5** and **Django REST Framework**, the combination that still powers a large share of production Python APIs. **PostgreSQL** as the database, **Celery** + **Redis** for background tasks and scheduled jobs, **drf-spectacular** for an auto-generated OpenAPI schema and Swagger UI. **Token-based authentication** (DRF tokens or JWT via SimpleJWT — both wired). **django-environ** for typed environment configuration.

Tests run on **pytest-django** with **factory-boy** fixtures. **ruff** for linting and formatting, **mypy** with `django-stubs` for the type checks Django itself doesn't enforce. Production is **gunicorn** behind **nginx**, with **whitenoise** for static assets and **structlog** for structured JSON logging.

This is the project blueprint for "I want a typed, well-tested Python API with an admin out of the box."

## Architecture

**Apps are feature modules.** Each Django app (`users`, `billing`, `webhooks`) owns its models, serializers, views, services, and tests. Cross-app imports go through service-layer functions, not direct model imports.

**ViewSets for CRUD, APIViews for everything else.** DRF `ModelViewSet` covers the standard cases. For non-CRUD endpoints (webhooks, custom actions, aggregations), drop down to `APIView` — don't force it through ViewSet machinery.

**Services live in `services.py`.** Business logic is plain functions that take primitive arguments and return data. Views call services. Tests call services directly. Logic is never inside a serializer or a view method.

**Celery tasks are idempotent and small.** Each task does one thing. Heavy workflows are chains (`task.s() | task.s()`) or chords, not monolithic functions. Tasks live in `tasks.py` per app.

**Migrations are sacred.** Every schema change ships a migration; nobody runs `--fake` in CI. `python manage.py makemigrations --check` is a required test.

## File structure

```
config/
├── settings/
│   ├── base.py              Defaults
│   ├── development.py       DEBUG = True, console email, ...
│   └── production.py        DEBUG = False, strict cookies, ...
├── urls.py                  Root URL conf
├── asgi.py                  Async entry (channels-ready)
└── wsgi.py                  Sync entry (gunicorn)

apps/
├── users/                   Example feature app
│   ├── models.py
│   ├── serializers.py
│   ├── services.py
│   ├── views.py
│   ├── urls.py
│   ├── tasks.py
│   ├── admin.py
│   └── tests/
└── ...

common/
├── pagination.py
├── permissions.py
└── exceptions.py            Custom DRF exception handler

requirements/
├── base.txt
├── development.txt          + pytest, ruff, mypy
└── production.txt           + gunicorn, whitenoise, structlog
```

## Getting started

```bash
# 1. Scaffold the project
npx specdriven add spec django-api

# 2. Configure
cd .claude/specs/django-api
cp env.example.txt .env

# 3. Set the required values
#    - DATABASE_URL (Postgres)
#    - REDIS_URL (Celery broker + result backend)
#    - SECRET_KEY (django-environ)
#    - ALLOWED_HOSTS

# 4. Install and migrate
python -m venv .venv && source .venv/bin/activate
pip install -r requirements/development.txt
python manage.py migrate
python manage.py createsuperuser

# 5. Run API and worker
python manage.py runserver           # http://localhost:8000
celery -A config worker -l info      # in another terminal
celery -A config beat -l info        # for scheduled tasks
```

Swagger UI lives at `/api/schema/swagger-ui/`, the raw OpenAPI schema at `/api/schema/`. Django admin at `/admin/`.

## Opinionated choices, with reasons

- **Django + DRF over FastAPI.** Django ships an admin, an ORM with mature migrations, a battle-tested auth system, and 20 years of community packages. FastAPI is leaner and faster but gives you nothing for CRUD on day one. Use `fastapi-service` for slim async APIs, `django-api` for product APIs with a back office.
- **Celery over RQ/Dramatiq.** Mature, well-documented, the default for a reason. RQ is simpler but its featureset stops being enough quickly.
- **drf-spectacular over drf-yasg.** Actively maintained, OpenAPI 3.x, better serializer support. drf-yasg is in maintenance mode.
- **pytest-django over Django's test runner.** Fixtures are better, parametrisation is cleaner, watch mode works. Django's runner is fine; pytest is friendlier at scale.
- **mypy + django-stubs.** Catches the integer-vs-queryset bugs Django itself misses. The setup pays off after a thousand lines.
- **ruff over black + flake8 + isort.** One tool, faster than any of them, handles all three jobs.

## Skills paired with this spec

- `api-designer` — DRF ViewSet + serializer conventions
- `test-writer` — pytest-django + factory-boy patterns
- `openapi-spec` — drf-spectacular schema review and tweaks
- `security-auditor` — DRF permissions, CSRF, dependency audits

Install individually with `npx specdriven add skill <slug>`, or accept them all when you install this spec.

## When this spec is the wrong fit

- **Pure async streaming API or websocket-heavy app.** Use FastAPI or Django Channels directly.
- **No need for an admin or relational data.** A FastAPI service is half the code.
- **Node.js or Go ecosystem.** Use `nestjs-api` or `go-service`.
- **Tiny microservice.** Django boots take seconds; for small services a Go binary is more honest.

If you want a Python backend that will still make sense to a new hire two years from now, this spec is the right shape.
