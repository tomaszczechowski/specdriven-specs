# specdriven-specs

<p align="center">
  <a href="https://github.com/tomaszczechowski/specdriven-specs/tree/main/content/specs"><img src="https://img.shields.io/github/directory-file-count/tomaszczechowski/specdriven-specs/content%2Fspecs?type=dir&label=specs%20in%20catalog&style=flat-square&color=22d3ee&labelColor=0a0a0a" alt="Specs in catalog"/></a>
  <a href="https://github.com/tomaszczechowski/specdriven-specs/commits/main"><img src="https://img.shields.io/github/last-commit/tomaszczechowski/specdriven-specs?style=flat-square&labelColor=0a0a0a" alt="Last update"/></a>
  <a href="https://github.com/tomaszczechowski/specdriven-specs/pulls"><img src="https://img.shields.io/github/issues-pr/tomaszczechowski/specdriven-specs?style=flat-square&labelColor=0a0a0a&color=22d3ee" alt="Open PRs"/></a>
  <a href="./LICENSE"><img src="https://img.shields.io/github/license/tomaszczechowski/specdriven-specs?style=flat-square&labelColor=0a0a0a" alt="License"/></a>
  <a href="https://specdriven.sh/specs"><img src="https://img.shields.io/badge/%F0%9F%93%8B_Live_Catalog-specdriven.sh%2Fspecs-22d3ee?style=flat-square&labelColor=0a0a0a" alt="Live Catalog"/></a>
</p>

Community-contributed project specs for [specdriven.sh](https://specdriven.sh), part of the **Spec Driven Development (SDD)** ecosystem - a methodology for using AI-generated specifications to accelerate software development.

A **spec** is a complete project blueprint - a tech stack, architecture, and set of skills bundled into a starting point you can scaffold from. Browse the live library at [specdriven.sh/specs](https://specdriven.sh/specs).

## Hosting Modes - Internal vs External

A spec can be hosted in this catalog two ways:

- **Internal** - the full `SPEC.md` and supporting files live in this repo under `content/specs/<slug>/`. Maintainers review the body during PR. Best for community-curated specs.
- **External** - only `specdriven-metadata.json` lives here, with a `source` field pointing to your upstream GitHub repo. The CLI fetches files from upstream at install time. Best when you maintain a larger stack in your own repo and want it discoverable without duplicating content.

The `npx specdriven add spec <slug>` command works identically for both. See the [canonical docs](https://specdriven.sh/docs#internal-vs-external) for the full explanation.

## Contributing

Submissions welcome. Read [CONTRIBUTING.md](./CONTRIBUTING.md) for the workflow and [SPEC_REQUIREMENTS.md](./SPEC_REQUIREMENTS.md) for the frontmatter spec.

Quick start:

```bash
git clone https://github.com/tomaszczechowski/specdriven-specs.git
cd specdriven-specs
npm install

cp -r templates/spec-example content/specs/my-spec
# Edit SPEC.md (replace `name:`) and specdriven-metadata.json
# edit my-spec.mdx
npm run validate
```

Then open a pull request. CI runs the same validator and posts results as a comment.

## Repository Layout

```
.github/
├── pull_request_template.md     PR checklist shown to contributors
├── scripts/validate-specs.js    Frontmatter + content validator
└── workflows/validate-spec.yml  CI: runs validator, comments on PR
content/specs/<slug>/            One directory per spec: SPEC.md + specdriven-metadata.json + supporting files
templates/spec-example/          Starter template for new specs
CONTRIBUTING.md                  Submission workflow
SPEC_REQUIREMENTS.md             Frontmatter spec and field rules
```

## Review Process

1. CI validates frontmatter, content length, and that only files under `content/specs/<slug>/` were touched.
2. A maintainer reviews for usefulness, clarity, and uniqueness.
3. On merge, the spec is synced to specdriven.sh within an hour.

## License

[MIT](./LICENSE) - Copyright (c) 2026 Tomasz Czechowski.
