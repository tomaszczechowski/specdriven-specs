#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const matter = require("gray-matter");

const VALID_CATEGORIES = ["webapp", "api", "mobile", "data", "cli", "infra"];

const VALID_COMPLEXITY = ["starter", "production", "enterprise"];

const REQUIRED_FIELDS = [
    "title",
    "slug",
    "description",
    "category",
    "stack",
    "skills",
    "tags",
    "author",
    "updated",
    "complexity",
];

const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RESET = "\x1b[0m";

function log(msg, color = "") {
    console.log(color + msg + RESET);
}

function error(msg) {
    log(msg, RED);
}

function success(msg) {
    log(msg, GREEN);
}

function warn(msg) {
    log(msg, YELLOW);
}

function validateSpec(filePath) {
    const fileName = path.basename(filePath);
    const fileSlug = path.basename(filePath, ".mdx");

    log(`\nValidating: ${fileName}`);

    let content;
    try {
        content = fs.readFileSync(filePath, "utf-8");
    } catch (err) {
        error(`  ❌ Cannot read file: ${err.message}`);
        return false;
    }

    let parsed;
    try {
        parsed = matter(content);
    } catch (err) {
        error(`  ❌ Invalid YAML frontmatter: ${err.message}`);
        return false;
    }

    if (!parsed.data || Object.keys(parsed.data).length === 0) {
        error(`  ❌ No frontmatter found`);
        return false;
    }

    const frontmatter = parsed.data;
    const bodyContent = parsed.content;
    let valid = true;

    for (const field of REQUIRED_FIELDS) {
        if (!(field in frontmatter)) {
            error(`  ❌ Missing required field: ${field}`);
            valid = false;
        }
    }

    if (!valid) return false;

    if (frontmatter.slug !== fileSlug) {
        error(
            `  ❌ Slug "${frontmatter.slug}" doesn't match filename "${fileSlug}"`,
        );
        valid = false;
    }

    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(frontmatter.slug)) {
        error(`  ❌ Slug must be kebab-case: "${frontmatter.slug}"`);
        valid = false;
    }

    const checks = [
        {
            field: "title",
            validate: (v) => typeof v === "string" && v.length > 0 && v.length <= 80,
            msg: "must be a non-empty string, max 80 chars",
        },
        {
            field: "description",
            validate: (v) => typeof v === "string" && v.length > 0 && v.length <= 150,
            msg: "must be a non-empty string, max 150 chars",
        },
        {
            field: "category",
            validate: (v) => VALID_CATEGORIES.includes(v),
            msg: `must be one of: ${VALID_CATEGORIES.join(", ")}`,
        },
        {
            field: "stack",
            validate: (v) =>
                Array.isArray(v) &&
                v.length > 0 &&
                v.every((t) => typeof t === "string" && t.length > 0),
            msg: "must be a non-empty array of strings",
        },
        {
            field: "skills",
            validate: (v) =>
                Array.isArray(v) &&
                v.length > 0 &&
                v.every((t) => typeof t === "string" && /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(t)),
            msg: "must be a non-empty array of kebab-case skill slugs",
        },
        {
            field: "tags",
            validate: (v) => Array.isArray(v) && v.length > 0,
            msg: "must be a non-empty array",
        },
        {
            field: "author",
            validate: (v) => typeof v === "string" && v.length > 0,
            msg: "must be a non-empty string",
        },
        {
            field: "updated",
            validate: (v) => {
                const str = v instanceof Date ? v.toISOString().slice(0, 10) : String(v);

                return /^\d{4}-\d{2}-\d{2}$/.test(str);
            },
            msg: "must be an ISO date (YYYY-MM-DD)",
        },
        {
            field: "complexity",
            validate: (v) => VALID_COMPLEXITY.includes(v),
            msg: `must be one of: ${VALID_COMPLEXITY.join(", ")}`,
        },
    ];

    for (const check of checks) {
        if (!check.validate(frontmatter[check.field])) {
            error(`  ❌ ${check.field}: ${check.msg}`);
            valid = false;
        }
    }

    // stars/installs are filled in by the maintainer during review
    if (frontmatter.stars !== undefined || frontmatter.installs !== undefined) {
        warn(
            `  ⚠️  Leave stars/installs blank — the maintainer fills these in during review`,
        );
    }

    const wordCount = bodyContent.split(/\s+/).filter((w) => w.length > 0).length;

    if (wordCount < 100) {
        error(`  ❌ Content too short: ${wordCount} words (minimum 100)`);
        valid = false;
    }

    if (frontmatter.title.length > 60) {
        warn(`  ⚠️  title is long (${frontmatter.title.length} chars)`);
    }

    if (!bodyContent.includes("##")) {
        warn(`  ⚠️  No markdown headers found (expected ## What's included, etc.)`);
    }

    if (valid) {
        success(`  ✅ Valid`);
    }

    return valid;
}

const specsDir = path.join(process.cwd(), "content", "specs");

if (!fs.existsSync(specsDir)) {
    error("content/specs directory not found!");
    process.exit(1);
}

let files;
if (process.argv.length > 2) {
    files = process.argv.slice(2).map((f) => path.resolve(f));
} else {
    files = fs
        .readdirSync(specsDir)
        .filter((f) => f.endsWith(".mdx"))
        .map((f) => path.join(specsDir, f));
}

if (files.length === 0) {
    warn("No spec files found");
    process.exit(0);
}

let allValid = true;
for (const file of files) {
    if (!validateSpec(file)) {
        allValid = false;
    }
}

log("");

if (allValid) {
    success("✅ All specs valid!");
    process.exit(0);
} else {
    error("❌ Validation failed!");
    process.exit(1);
}
