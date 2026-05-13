# Contributing to specdriven-specs

Thanks for helping us build the spec library! This guide explains how to submit your project spec.

## What is a Spec?

A spec is a complete project blueprint — a curated tech stack plus the architecture and AI skills you need to ship it. Examples:

- A production SaaS starter on Next.js + PostgreSQL + Stripe
- A FastAPI microservice with async workers and observability
- A React Native mobile app with Expo, NativeWind, and Convex
- A serverless data pipeline on AWS

Each spec is one `.mdx` file describing **what's included**, **how it's architected**, **how to get started**, and which existing skills go well with it.

## How to Contribute

### 1. Fork the Repository

Click "Fork" on GitHub to create your copy of `specdriven-specs`.

```bash
git clone https://github.com/tomaszczechowski/specdriven-specs.git
cd specdriven-specs
```

### 2. Create Your Spec

Copy the template to create your spec file:

```bash
cp -r templates/spec-example content/specs/my-spec
mv content/specs/my-spec/spec-example.mdx content/specs/my-spec/my-spec.mdx
```

Edit the file:

- Replace all frontmatter fields (title, slug, description, etc.)
- Write the "What's included", "Architecture", and "Getting started" sections
- Keep description under 150 characters
- Ensure total content is >100 words

See [SPEC_REQUIREMENTS.md](./SPEC_REQUIREMENTS.md) for detailed requirements.

### 3. Test Locally

```bash
# Install dependencies (one-time setup)
npm install

# Validate your spec
npm run validate
```

### 4. Commit and Push

Work on a feature branch — do not push to `main` on your fork:

```bash
git checkout -b add-my-spec
git add content/specs/my-spec
git commit -m "Add spec: My Spec"
git push origin add-my-spec
```

### 5. Create a Pull Request

On GitHub, click "New Pull Request" and provide a brief description:

- What spec you're adding
- Why it's useful and who it's for

A checklist will appear automatically — verify all items pass.

## Review Process

- **Timeline:** We aim to review and respond within 48 hours
- **Feedback:** We may request clarifications or improvements
- **Merge:** Once approved, your spec appears on specdriven.sh within 1 hour

## Quality Guidelines

✅ **Good specs:**

- Describe a real, shippable project — not a toy example
- Pick one opinionated stack and explain the choices
- Reference existing skills from [specdriven-skills](https://github.com/tomaszczechowski/specdriven-skills) where they apply
- Include realistic getting-started commands

❌ **Avoid:**

- Generic stack lists without architecture context
- Duplicate specs (search existing specs first)
- Marketing copy or vendor pitches
- Specs that depend on unreleased or unstable tools

## Questions?

Check [SPEC_REQUIREMENTS.md](./SPEC_REQUIREMENTS.md) for technical details, or open an issue.

## Code of Conduct

Be respectful and constructive. We're building together.

---

Happy contributing! 🚀
