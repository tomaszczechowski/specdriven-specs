# Spec Requirements & Format

This document specifies the exact format and requirements for spec submissions.

## File Structure

```
content/specs/[slug].mdx
```

- **Location:** `content/specs/` directory
- **Format:** Markdown with YAML frontmatter (`.mdx` extension)
- **Naming:** Slug must be `kebab-case` and match the filename exactly
- **Example:** `nextjs-saas.mdx` for slug `nextjs-saas`

## Frontmatter Fields (Required)

All fields below are required. Must be valid YAML.

```yaml
title: string
slug: string (kebab-case, must match filename)
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
| `slug`        | string | Kebab-case, unique, matches filename                                                             | `"nextjs-saas"`                                    |
| `description` | string | Max 150 chars, no markdown                                                                       | `"Production SaaS template with auth and billing"` |
| `category`    | string | One of: `webapp`, `api`, `mobile`, `data`, `cli`, `infra`                                        | `"webapp"`                                         |
| `stack`       | array  | Free-form list of technologies, 1+ entries                                                       | `["Next.js", "PostgreSQL", "Stripe"]`              |
| `skills`      | array  | Slugs of skills from [specdriven-skills](https://github.com/tomaszczechowski/specdriven-skills) that pair with this spec | `["code-reviewer", "e2e-playwright"]`              |
| `tags`        | array  | Custom tags, 1-5 recommended, lowercase                                                          | `["saas", "auth", "billing"]`                      |
| `author`      | string | Your name or "community"                                                                         | `"Tomasz Czechowski"`                              |
| `updated`     | string | ISO date format                                                                                  | `"2026-05-08"`                                     |
| `complexity`  | string | One of: `starter`, `production`, `enterprise`                                                    | `"production"`                                     |

### Maintainer-Managed Fields

Do **not** set these — leave them out of your frontmatter entirely. The maintainer fills them in during review:

- `stars` — community interest metric
- `installs` — usage metric

Submitting a PR with these fields set will trigger a warning in CI.

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

### Content Rules

- **Markdown only:** Standard markdown + basic MDX
- **Length:** Minimum 100 words, no maximum
- **Clarity:** Assume reader is a developer but unfamiliar with your specific stack
- **Links:** Use `[text](url)` format
- **Code blocks:** Use triple backticks with language: ` ```typescript `

## Validation Checklist

Before submitting, ensure:

- ✅ File is named `[slug].mdx`
- ✅ Slug matches filename (case-sensitive, kebab-case)
- ✅ All required frontmatter fields present
- ✅ YAML frontmatter is valid (no syntax errors)
- ✅ `title` is under 80 characters
- ✅ `description` is under 150 characters, no markdown
- ✅ `category` is from the allowed list
- ✅ `stack`, `skills`, and `tags` are non-empty arrays
- ✅ `complexity` is from the allowed list
- ✅ `updated` is in ISO date format (YYYY-MM-DD)
- ✅ `stars` and `installs` are not set (maintainer fills these in)
- ✅ Content is >100 words
- ✅ No duplicate slug (check existing specs)
- ✅ Only this `.mdx` file is in the PR (no other changes)

## Examples

### ✅ Good Frontmatter

```yaml
title: Next.js SaaS
slug: nextjs-saas
description: Production SaaS template with auth, billing, and multi-tenancy on Next.js 15 App Router.
category: webapp
stack: [Next.js, PostgreSQL, Tailwind, Stripe, Resend]
skills: [code-reviewer, e2e-playwright, security-auditor]
tags: [saas, auth, billing, multi-tenancy, nextjs]
author: Tomasz Czechowski
updated: 2026-05-08
complexity: production
```

### ❌ Bad Examples

```yaml
# Slug doesn't match filename
title: My Cool Spec
slug: my-spec
# File is: my-cool-spec.mdx ← MISMATCH

# Description too long (>150 chars)
description: This is a very long description that exceeds the 150 character limit and explains the spec in way too much detail and goes on...

# Invalid category
category: random

# Empty arrays
stack: []
skills: []

# Invalid complexity
complexity: medium

# Date wrong format
updated: May 8, 2026
```

## Uniqueness

- Slug must be globally unique (check existing specs)
- If a spec with the same slug exists, change yours
- No duplicate specs targeting the same stack — combine effort instead

## What Gets Validated Automatically

GitHub Actions will check:

- ✅ YAML syntax is valid
- ✅ All required fields present
- ✅ Field types are correct
- ✅ Slug matches filename
- ✅ Category and complexity are valid
- ✅ Arrays are non-empty
- ✅ No other files modified in PR

## Questions?

Refer to `templates/spec-example.mdx` for a complete working example.
