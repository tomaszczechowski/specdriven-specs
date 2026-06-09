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
const MODEL_ID = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";
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
  reasoning: z
    .string()
    .describe(
      "Score each dimension 0-20 with a one-sentence justification, then sum to the final score.",
    ),
  status: z.enum(["pass", "warn", "fail"]),
  score: z.number().min(0).max(100).transform(Math.round),
  notes: z.string().transform((s) => s.slice(0, 220)),
});

const SYSTEM_PROMPT = `You are a senior staff engineer reviewing community-contributed specs for specdriven.sh — a catalog of opinionated, production-grade project blueprints (SDD: Spec Driven Development).

The canonical requirements document is included in the prompt. Score the SPEC.md honestly and critically — most specs have real weaknesses; finding them is your job.

STEP 1 — Score each dimension 0-20, write a one-sentence justification, and record it in the "reasoning" field:

1. Substance (0-20): Does it name concrete dependency versions, real file paths, actual config content — not generic "use X"?
   20: Every major dep versioned, real paths and config snippets throughout
   15: Most deps versioned, some concrete detail
   10: Stack named but few specifics; feels like an outline
    5: Generic template; no versions, no paths, no config
    0: Placeholder content

2. Reasoning (0-20): Does an opinionated-choices section (or distributed rationale) genuinely justify each decision with trade-offs?
   20: Every major choice has a clear "why" plus acknowledged trade-off
   15: Most choices explained; 1-2 left without rationale
   10: Thin rationale; "X is popular" counts as reasoning here
    5: One or two vague justifications buried in prose
    0: No rationale at all

3. Honesty (0-20): Does a "When NOT to use" (or equivalent) section list real, specific limitations — not strawmen?
   20: 3+ specific limitations tied directly to architectural choices
   15: Section exists but limitations are vague or weak
   10: Implicit limitations only; no explicit section
    5: Section exists but limitations are strawmen or trivially obvious
    0: Missing entirely

4. Coherence (0-20): Is the stack consistent end-to-end? Are snippets plausible for that stack? Is the getting-started flow runnable?
   20: Fully consistent; every snippet correct; complete, runnable setup
   15: Mostly consistent; minor setup gaps
   10: Some inconsistencies or a setup step is missing
    5: Contradictions in the stack or broken setup flow
    0: Incoherent

5. Polish (0-20): Tight, professional prose — no filler, no buzzwords without meaning?
   20: Every sentence earns its place
   15: Mostly sharp; occasional filler phrase
   10: Noticeable padding or marketing language
    5: Significant filler; hard to extract signal
    0: Unreadable

STEP 2 — Sum the five dimension scores → that sum IS the final "score" field. Do not round to a round number; use the exact arithmetic sum.

STEP 3 — Derive "status" from the sum:
  80-100 → "pass"
  60-79  → "warn"
  <60    → "fail"

STEP 4 — Write "notes": ≤180 chars. For "pass", name the single strongest quality. For "warn"/"fail", name the single most actionable gap.`;

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
      temperature: 0.3,
      maxRetries: 2,
    });

    const result = { status: object.status, score: object.score, checked: today, notes: object.notes };

    return result;
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
