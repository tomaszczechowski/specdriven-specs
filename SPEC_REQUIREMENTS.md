# Spec Requirements & Format

This document specifies the exact format and requirements for spec submissions.

## Directory Layout

Each spec lives in its own directory under `content/specs/`:

```
content/specs/<slug>/
├── <slug>.mdx         REQUIRED — the entry file with frontmatter and blueprint
├── scripts/           OPTIONAL — setup or scaffolding scripts
│   └── bootstrap.sh
├── examples/          OPTIONAL — example files (env, configs, snippets)
│   └── env.example
└── ...
```

- **Directory name** must equal the slug (kebab-case)
- **Entry file** must be named `<slug>.mdx` and sit at the root of the directory
- **Supporting files** may live at any depth under the slug directory

### Allowed File Types

Supporting files must use one of these extensions: `.mdx`, `.md`, `.sh`, `.json`, `.yaml`, `.yml`, `.toml`, `.txt`, `.js`, `.ts`, `.py`, `.xml`, `.xsd`, `.html`, `.pdf`, `.ttf`, `.tar`, `.gz` (a `.tar.gz` archive matches via the trailing `.gz`).

### Size & Count Limits

| Limit                | Value |
| -------------------- | ----- |
| Files per spec       | 50    |
| Bytes per file       | 5 MB  |
| Total bytes per spec | 30 MB |

Symlinks are not allowed anywhere in the tree.

## Frontmatter Fields (in `<slug>.mdx`)

All fields below are required. Must be valid YAML.

```yaml
title: string
slug: string (kebab-case, must match directory name)
description: string
category: string (enum)
stack: array (strings)
skills: array (strings, kebab-case skill slugs)
tags: array (strings)
author: string
updated: string (ISO date: YYYY-MM-DD)
complexity: string (enum)
```

### Field Specifications

| Field         | Type   | Rules                                                                                            | Example                                            |
| ------------- | ------ | ------------------------------------------------------------------------------------------------ | -------------------------------------------------- |
| `title`       | string | Max 80 chars                                                                                     | `"Next.js SaaS"`                                   |
| `slug`        | string | Kebab-case, unique, matches directory name                                                       | `"nextjs-saas"`                                    |
| `description` | string | Max 150 chars, no markdown                                                                       | `"Production SaaS template with auth and billing"` |
| `category`    | string | One of: `webapp`, `api`, `mobile`, `data`, `cli`, `infra`                                        | `"webapp"`                                         |
| `stack`       | array  | Free-form list of technologies, 1+ entries                                                       | `["Next.js", "PostgreSQL", "Stripe"]`              |
| `skills`      | array  | Slugs of skills from [specdriven-skills](https://github.com/tomaszczechowski/specdriven-skills) that pair with this spec | `["code-reviewer", "e2e-playwright"]` |
| `tags`        | array  | Custom tags, 1-5 recommended, lowercase                                                          | `["saas", "auth", "billing"]`                      |
| `author`      | string | Your name or "community"                                                                         | `"Tomasz Czechowski"`                              |
| `updated`     | string | ISO date format                                                                                  | `"2026-05-08"`                                     |
| `complexity`  | string | One of: `starter`, `production`, `enterprise`                                                    | `"production"`                                     |

## Content Structure

After frontmatter, write markdown content. Minimum 100 words total.

### Recommended Sections

```markdown
## What's included

2-3 paragraphs explaining what ships with this spec.

## Architecture

How the major pieces fit together. Mention which decisions are opinionated and why.

## Getting started

Commands and steps to scaffold the project locally.
```

## Validation Checklist

Before submitting, ensure:

- ✅ Directory is named `content/specs/<slug>/`
- ✅ Entry file `<slug>.mdx` exists at the directory root
- ✅ All required frontmatter fields present
- ✅ YAML frontmatter is valid (no syntax errors)
- ✅ `title` is under 80 characters
- ✅ `description` is under 150 characters, no markdown
- ✅ `category` is from the allowed list
- ✅ `stack`, `skills`, and `tags` are non-empty arrays
- ✅ `complexity` is from the allowed list
- ✅ `updated` is in ISO date format (YYYY-MM-DD)
- ✅ Content body is >100 words
- ✅ All supporting files use an allowed extension
- ✅ No file exceeds 1 MB; total under 5 MB
- ✅ No symlinks in the directory
- ✅ Only files under your spec's directory are modified in the PR

## What Gets Validated Automatically

GitHub Actions will check:

- ✅ Entry MDX exists and frontmatter is valid
- ✅ Slug matches directory name
- ✅ All required fields present and correctly typed
- ✅ Category and complexity are from the allowed list
- ✅ File extensions, sizes, and counts within limits
- ✅ No symlinks
- ✅ No files modified outside `content/specs/`

## Questions?

Refer to `templates/spec-example/` for a complete working example.
