# specdriven-specs

Community-contributed project specs for [specdriven.sh](https://specdriven.sh).

A **spec** is a complete project blueprint — a tech stack, architecture, and set of skills bundled into a starting point you can scaffold from. Browse the live library at [specdriven.sh/specs](https://specdriven.sh/specs).

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

[MIT](./LICENSE) — Copyright (c) 2026 Tomasz Czechowski.
