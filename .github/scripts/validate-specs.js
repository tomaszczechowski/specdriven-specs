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

const ALLOWED_EXTENSIONS = new Set([
    ".mdx",
    ".md",
    ".sh",
    ".json",
    ".yaml",
    ".yml",
    ".toml",
    ".txt",
    ".js",
    ".ts",
    ".py",
    ".xml",
    ".xsd",
    ".html",
    ".pdf",
    ".ttf",
    ".tar",
    ".gz",
]);

const MAX_FILES_PER_SPEC = 50;
const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_TOTAL_BYTES = 30 * 1024 * 1024; // 30 MB
const MIN_WORDS = 100;

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

function walkDir(root) {
    const results = [];
    const stack = [root];

    while (stack.length) {
        const dir = stack.pop();
        const entries = fs.readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
            const full = path.join(dir, entry.name);

            if (entry.isSymbolicLink()) {
                results.push({ path: full, kind: "symlink" });
                continue;
            }

            if (entry.isDirectory()) {
                stack.push(full);
                continue;
            }

            if (entry.isFile()) {
                results.push({ path: full, kind: "file" });
            }
        }
    }

    return results;
}

function validateEntryFrontmatter(slug, content) {
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

    const fm = parsed.data;
    const body = parsed.content;
    let valid = true;

    for (const field of REQUIRED_FIELDS) {
        if (!(field in fm)) {
            error(`  ❌ Missing required field: ${field}`);
            valid = false;
        }
    }

    if (!valid) return false;

    if (fm.slug !== slug) {
        error(`  ❌ Slug "${fm.slug}" doesn't match directory "${slug}"`);
        valid = false;
    }

    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(fm.slug)) {
        error(`  ❌ Slug must be kebab-case: "${fm.slug}"`);
        valid = false;
    }

    const checks = [
        {
            field: "title",
            ok: (v) => typeof v === "string" && v.length > 0 && v.length <= 80,
            msg: "must be a non-empty string, max 80 chars",
        },
        {
            field: "description",
            ok: (v) => typeof v === "string" && v.length > 0 && v.length <= 150,
            msg: "must be a non-empty string, max 150 chars",
        },
        {
            field: "category",
            ok: (v) => VALID_CATEGORIES.includes(v),
            msg: `must be one of: ${VALID_CATEGORIES.join(", ")}`,
        },
        {
            field: "stack",
            ok: (v) =>
                Array.isArray(v) &&
                v.length > 0 &&
                v.every((t) => typeof t === "string" && t.length > 0),
            msg: "must be a non-empty array of strings",
        },
        {
            field: "skills",
            ok: (v) =>
                Array.isArray(v) &&
                v.length > 0 &&
                v.every((t) => typeof t === "string" && /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(t)),
            msg: "must be a non-empty array of kebab-case skill slugs",
        },
        {
            field: "tags",
            ok: (v) => Array.isArray(v) && v.length > 0,
            msg: "must be a non-empty array",
        },
        {
            field: "author",
            ok: (v) => typeof v === "string" && v.length > 0,
            msg: "must be a non-empty string",
        },
        {
            field: "updated",
            ok: (v) => {
                const str = v instanceof Date ? v.toISOString().slice(0, 10) : String(v);

                return /^\d{4}-\d{2}-\d{2}$/.test(str);
            },
            msg: "must be an ISO date (YYYY-MM-DD)",
        },
        {
            field: "complexity",
            ok: (v) => VALID_COMPLEXITY.includes(v),
            msg: `must be one of: ${VALID_COMPLEXITY.join(", ")}`,
        },
    ];

    for (const c of checks) {
        if (!c.ok(fm[c.field])) {
            error(`  ❌ ${c.field}: ${c.msg}`);
            valid = false;
        }
    }

    const wordCount = body.split(/\s+/).filter((w) => w.length > 0).length;

    if (wordCount < MIN_WORDS) {
        error(`  ❌ Content too short: ${wordCount} words (minimum ${MIN_WORDS})`);
        valid = false;
    }

    if (fm.title && fm.title.length > 60) {
        warn(`  ⚠️  title is long (${fm.title.length} chars)`);
    }

    if (!body.includes("##")) {
        warn(`  ⚠️  No markdown headers found (expected ## What's included, etc.)`);
    }

    return valid;
}

function validateSpecDirectory(specDir) {
    const slug = path.basename(specDir);

    log(`\nValidating: ${slug}/`);

    if (!fs.existsSync(specDir) || !fs.statSync(specDir).isDirectory()) {
        error(`  ❌ Not a directory: ${specDir}`);

        return false;
    }

    const entryPath = path.join(specDir, `${slug}.mdx`);

    if (!fs.existsSync(entryPath)) {
        error(`  ❌ Missing entry file: ${slug}.mdx`);

        return false;
    }

    const entries = walkDir(specDir);
    let valid = true;
    let totalBytes = 0;
    let symlinkFound = false;

    for (const e of entries) {
        const rel = path.relative(specDir, e.path);

        if (e.kind === "symlink") {
            error(`  ❌ Symlinks are not allowed: ${rel}`);
            symlinkFound = true;
            valid = false;
            continue;
        }

        const ext = path.extname(rel).toLowerCase();

        if (!ALLOWED_EXTENSIONS.has(ext)) {
            error(`  ❌ Disallowed file extension: ${rel} (allowed: ${[...ALLOWED_EXTENSIONS].join(", ")})`);
            valid = false;
            continue;
        }

        const size = fs.statSync(e.path).size;

        totalBytes += size;

        if (size > MAX_FILE_BYTES) {
            error(`  ❌ File too large: ${rel} (${size} bytes, max ${MAX_FILE_BYTES})`);
            valid = false;
        }
    }

    if (symlinkFound) return false;

    const fileCount = entries.filter((e) => e.kind === "file").length;

    if (fileCount > MAX_FILES_PER_SPEC) {
        error(`  ❌ Too many files: ${fileCount} (max ${MAX_FILES_PER_SPEC})`);
        valid = false;
    }

    if (totalBytes > MAX_TOTAL_BYTES) {
        error(`  ❌ Total size too large: ${totalBytes} bytes (max ${MAX_TOTAL_BYTES})`);
        valid = false;
    }

    const entryContent = fs.readFileSync(entryPath, "utf-8");

    if (!validateEntryFrontmatter(slug, entryContent)) {
        valid = false;
    }

    if (valid) {
        success(`  ✅ Valid (${fileCount} file${fileCount === 1 ? "" : "s"}, ${totalBytes} bytes)`);
    }

    return valid;
}

const specsRoot = path.join(process.cwd(), "content", "specs");

if (!fs.existsSync(specsRoot)) {
    error("content/specs directory not found!");
    process.exit(1);
}

let targets;

if (process.argv.length > 2) {
    targets = process.argv.slice(2).map((s) => {
        if (path.isAbsolute(s)) return s;
        if (s.includes("/")) return path.resolve(s);

        return path.join(specsRoot, s);
    });
} else {
    targets = fs
        .readdirSync(specsRoot)
        .map((name) => path.join(specsRoot, name))
        .filter((p) => fs.statSync(p).isDirectory());
}

if (targets.length === 0) {
    warn("No specs to validate");
    process.exit(0);
}

let allValid = true;

for (const target of targets) {
    if (!validateSpecDirectory(target)) {
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
