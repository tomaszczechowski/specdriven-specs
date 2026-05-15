# Spec Requirements & Format

This document specifies the exact format and requirements for spec submissions.

## Directory Layout

Each spec lives in its own directory under `content/specs/`:

```
content/specs/<slug>/
├── SPEC.md                     REQUIRED - entry with name, description, body
├── specdriven-metadata.json    REQUIRED - catalog metadata
├── scripts/                    OPTIONAL - setup or scaffolding scripts
│   └── bootstrap.sh
└── examples/                   OPTIONAL - example files (env, configs, snippets)
    └── env.example
```

- **Directory name** equals the slug (kebab-case)
- **`SPEC.md`** is the canonical entry file
- **`specdriven-metadata.json`** is a sidecar with catalog-only fields. The CLI **does not** install this file - it stays in the source repo for the marketplace.

### Allowed File Types

Supporting files must use one of these extensions: `.mdx`, `.md`, `.sh`, `.json`, `.yaml`, `.yml`, `.toml`, `.txt`, `.js`, `.ts`, `.py`, `.xml`, `.xsd`, `.html`, `.pdf`, `.ttf`, `.tar`, `.gz`.

### Size & Count Limits

| Limit                | Value |
| -------------------- | ----- |
| Files per spec       | 50    |
| Bytes per file       | 5 MB  |
| Total bytes per spec | 30 MB |

Symlinks are not allowed anywhere in the tree.

## `SPEC.md` Frontmatter

```yaml
---
name: nextjs-saas
description: Production SaaS template with auth, billing, and multi-tenancy on Next.js 15 App Router.
---

## What's included

...content body, minimum 100 words...
```

| Field         | Type   | Rules                                                                    |
| ------------- | ------ | ------------------------------------------------------------------------ |
| `name`        | string | Kebab-case, equals the directory name                                    |
| `description` | string | Max 150 chars, no markdown                                               |

Body content: minimum 100 words, markdown only.

## `specdriven-metadata.json`

```json
{
  "title": "Next.js SaaS",
  "category": "webapp",
  "stack": ["Next.js", "PostgreSQL", "Tailwind", "Stripe", "Resend"],
  "skills": ["code-reviewer", "e2e-playwright", "security-auditor"],
  "tags": ["saas", "auth", "billing"],
  "author": "your-name",
  "updated": "2026-05-08",
  "complexity": "production"
}
```

| Field        | Type   | Rules                                                                                          |
| ------------ | ------ | ---------------------------------------------------------------------------------------------- |
| `title`      | string | Max 80 chars; display name                                                                     |
| `category`   | string | One of: `webapp`, `api`, `mobile`, `data`, `cli`, `infra`                                      |
| `stack`      | array  | Free-form list of technologies (non-empty)                                                     |
| `skills`     | array  | Slugs of [specdriven-skills](https://github.com/tomaszczechowski/specdriven-skills) that pair |
| `tags`       | array  | Custom tags, 1–5 recommended, lowercase                                                        |
| `author`     | string | Your name or `"community"`                                                                     |
| `updated`    | string | ISO date format (YYYY-MM-DD)                                                                   |
| `complexity` | string | One of: `starter`, `production`, `enterprise`                                                  |

## Validation Checklist

Before submitting, ensure:

- ✅ Directory is named `content/specs/<slug>/`
- ✅ `SPEC.md` exists with valid frontmatter
- ✅ `name` in `SPEC.md` matches the directory name
- ✅ `description` is under 150 characters, no markdown
- ✅ SPEC.md body is >100 words
- ✅ `specdriven-metadata.json` exists with all required fields
- ✅ `category` is from the allowed list
- ✅ `stack`, `skills`, and `tags` are non-empty arrays
- ✅ `complexity` is from the allowed list
- ✅ `updated` is in ISO date format (YYYY-MM-DD)
- ✅ Supporting files use an allowed extension
- ✅ No file exceeds 5 MB; total under 30 MB; max 50 files
- ✅ No symlinks
- ✅ Only files under your spec's directory are modified in the PR

## Questions?

Refer to `templates/spec-example/` for a complete working example.
