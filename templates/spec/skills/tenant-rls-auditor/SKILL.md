---
name: tenant-rls-auditor
description: "Reviews Postgres RLS policies for cross-tenant data leaks specific to this spec's schema."
---

## What it does

Reads the project's row-level security policies (under `db/policies.sql` or the Drizzle migrations folder) and audits them against the patterns this spec assumes: every user-facing table has a `tenant_id` column, every table has a policy that filters on the session-scoped `tenant_id` setting, and no service-role queries bypass tenancy without explicit justification.

Surfaces three classes of finding:

- **Critical** — a table has `tenant_id` but no enabling policy, so RLS isn't actually enforced.
- **Suspicious** — a policy exists but its predicate doesn't reference the tenant context, so it doesn't gate anything meaningful.
- **Informational** — a query uses the service-role client (`SUPABASE_SERVICE_ROLE_KEY` or equivalent) and skips RLS by design — review whether the bypass is intentional.

## Best for

- Reviewing the diff of any migration that adds or modifies a multi-tenant table
- Quarterly audits of an existing schema before a security review
- Running before pen-tests or compliance attestations

## What it deliberately doesn't do

- It doesn't write the policies for you — it audits ones you've already written.
- It doesn't run on a live database — it reads files. Pair it with `psql` for runtime checks.
