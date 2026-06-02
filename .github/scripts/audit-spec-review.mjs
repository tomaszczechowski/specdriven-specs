#!/usr/bin/env node
/**
 * Spec Review review auditor.
 *
 * Reads each spec's SPEC.md, sends it to Claude (via @ai-sdk/anthropic) with
 * the project's SPEC_REQUIREMENTS.md as grounding rubric, and writes the
 * result back to the spec's `specdriven-metadata.json` under
 * `audits["spec-review"]`.
 *
 * Required env:
 *   ANTHROPIC_API_KEY   — Anthropic API key
 *
 * Optional env:
 *   ANTHROPIC_MODEL     — override the model (default: claude-haiku-4-5-20251001)
 *   SPECS_FILTER        — comma-separated list of slugs to audit (default: all)
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createAnthropic } from "@ai-sdk/anthropic";
import { generateObject } from "ai";
import { z } from "zod";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");
const SPECS_DIR = path.join(ROOT, "content", "specs");
const REQUIREMENTS_PATH = path.join(ROOT, "SPEC_REQUIREMENTS.md");

const API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL_ID = process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001";
const FILTER = (process.env.SPECS_FILTER ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const today = new Date().toISOString().slice(0, 10);
const credentialsMissing = !API_KEY;

if (credentialsMissing) {
  console.warn(
    "[audit] ANTHROPIC_API_KEY not set — writing 'unknown' status placeholders. Set the secret before running for real reviews.",
  );
}

const ReviewSchema = z.object({
  status: z.enum(["pass", "warn", "fail"]),
  score: z.number().int().min(0).max(100),
  notes: z.string().max(220),
});

const SYSTEM_PROMPT = `You are a senior staff engineer reviewing community-contributed specs for specdriven.sh — a catalog of opinionated, production-grade project blueprints (SDD: Spec Driven Development).

Score the supplied SPEC.md against the dimensions below. The canonical requirements document follows after this prompt and defines the required structure and frontmatter.

QUALITY DIMENSIONS (weight roughly equally):
1. Substance — describes a real, opinionated architecture with concrete versions, modules, file paths. Not a generic "use X" template.
2. Reasoning — the "Opinionated choices, with reasons" section actually justifies each decision (or equivalent rationale is present throughout).
3. Honesty — a "When this spec is the wrong fit" (or equivalent) section exists and lists real limitations, not weak strawmen.
4. Coherence — stated stack is consistent throughout. Code snippets are plausible for the named stack. Getting-started flow is complete and runnable.
5. Polish — clear prose, no filler, no marketing buzzwords without meaning.

SCORING:
  80-100 → status "pass"   — production-quality spec, install with confidence
  60-79  → status "warn"   — usable but has clear gaps; one or two dimensions are weak
  <60    → status "fail"   — vague, generic, contradicts itself, or missing required sections

Return one JSON object only:
  - status: "pass" | "warn" | "fail"
  - score:  integer 0-100
  - notes:  ≤180 chars, the single most actionable observation the author should address (or the strongest praise if pass)`;

function listSpecDirs() {
  if (!fs.existsSync(SPECS_DIR)) return [];

  return fs
    .readdirSync(SPECS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .filter((slug) => (FILTER.length === 0 ? true : FILTER.includes(slug)));
}

function readSpecBody(specDir) {
  const specPath = path.join(specDir, "SPEC.md");

  if (!fs.existsSync(specPath)) return null;

  return fs.readFileSync(specPath, "utf8");
}

const requirements = fs.existsSync(REQUIREMENTS_PATH)
  ? fs.readFileSync(REQUIREMENTS_PATH, "utf8")
  : "";

const anthropic = credentialsMissing
  ? null
  : createAnthropic({ apiKey: API_KEY });

async function review(slug, specBody) {
  if (!anthropic) {
    return {
      status: "unknown",
      checked: today,
      notes: "Spec Review API key not configured in CI.",
    };
  }

  if (!specBody) {
    return {
      status: "unknown",
      checked: today,
      notes: "SPEC.md not found.",
    };
  }

  try {
    const { object } = await generateObject({
      model: anthropic(MODEL_ID),
      schema: ReviewSchema,
      system: SYSTEM_PROMPT,
      prompt: `--- SPEC_REQUIREMENTS.md (rubric for required structure) ---\n${requirements}\n\n--- SPEC.md (slug: ${slug}) — score this spec ---\n${specBody}`,
      temperature: 0.2,
      maxRetries: 2,
    });

    return {
      status: object.status,
      score: object.score,
      checked: today,
      notes: object.notes,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    return {
      status: "unknown",
      checked: today,
      notes: `Spec Review review failed: ${message.slice(0, 180)}`,
    };
  }
}

function writeAudit(metaPath, result) {
  const raw = fs.readFileSync(metaPath, "utf8");
  const meta = JSON.parse(raw);

  meta.audits = meta.audits ?? {};
  const previous = meta.audits["spec-review"];

  meta.audits["spec-review"] = result;

  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2) + "\n");

  return { previous, current: result };
}

async function main() {
  const slugs = listSpecDirs();

  if (slugs.length === 0) {
    console.log("[spec-review] no specs to review");

    return;
  }

  let failures = 0;
  let regressions = 0;

  for (const slug of slugs) {
    const specDir = path.join(SPECS_DIR, slug);
    const metaPath = path.join(specDir, "specdriven-metadata.json");

    if (!fs.existsSync(metaPath)) {
      console.log(`[spec-review] ${slug}: skipped (no metadata)`);
      continue;
    }

    const specBody = readSpecBody(specDir);
    const result = await review(slug, specBody);
    const { previous, current } = writeAudit(metaPath, result);
    const changed =
      !previous ||
      previous.status !== current.status ||
      previous.score !== current.score;

    console.log(
      `[spec-review] ${slug}: ${current.status}${typeof current.score === "number" ? ` (${current.score})` : ""}${changed ? " *" : ""}`,
    );

    if (current.status === "fail") {
      failures += 1;
    }

    if (previous && current.status === "fail" && previous.status !== "fail") {
      regressions += 1;
    }
  }

  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `failures=${failures}\n`);
    fs.appendFileSync(
      process.env.GITHUB_OUTPUT,
      `regressions=${regressions}\n`,
    );
  }
}

main().catch((err) => {
  console.error("[spec-review] fatal:", err);
  process.exit(1);
});
