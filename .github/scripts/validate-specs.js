#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const matter = require("gray-matter");

const ENTRY_FILENAME = "SPEC.md";
const METADATA_FILENAME = "specdriven-metadata.json";

const VALID_CATEGORIES = ["webapp", "api", "mobile", "data", "cli", "infra"];
const VALID_COMPLEXITY = ["starter", "production", "enterprise"];

const SPEC_REQUIRED_FRONTMATTER = ["name", "description"];
const METADATA_REQUIRED_LOCAL = ["title", "category", "stack", "skills", "tags", "author", "updated", "complexity"];
const METADATA_REQUIRED_EXTERNAL = ["title", "description", "category", "stack", "skills", "tags", "author", "updated", "complexity", "source"];

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
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_TOTAL_BYTES = 30 * 1024 * 1024;
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

function validateSpecFile(slug, entryPath) {
    let parsed;

    try {
        parsed = matter(fs.readFileSync(entryPath, "utf8"));
    } catch (err) {
        error(`  ❌ ${ENTRY_FILENAME}: Invalid YAML frontmatter: ${err.message}`);

        return false;
    }

    const fm = parsed.data ?? {};
    const body = parsed.content ?? "";
    let valid = true;

    for (const field of SPEC_REQUIRED_FRONTMATTER) {
        if (!(field in fm)) {
            error(`  ❌ ${ENTRY_FILENAME}: missing required field "${field}"`);
            valid = false;
        }
    }

    if (!valid) return false;

    if (fm.name !== slug) {
        error(`  ❌ ${ENTRY_FILENAME}: name "${fm.name}" doesn't match directory "${slug}"`);
        valid = false;
    }

    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(fm.name)) {
        error(`  ❌ ${ENTRY_FILENAME}: name must be kebab-case: "${fm.name}"`);
        valid = false;
    }

    if (typeof fm.description !== "string" || fm.description.length === 0 || fm.description.length > 150) {
        error(`  ❌ ${ENTRY_FILENAME}: description must be a non-empty string, max 150 chars`);
        valid = false;
    }

    const wordCount = body.split(/\s+/).filter((w) => w.length > 0).length;

    if (wordCount < MIN_WORDS) {
        error(`  ❌ ${ENTRY_FILENAME}: content too short: ${wordCount} words (minimum ${MIN_WORDS})`);
        valid = false;
    }

    if (!body.includes("##")) {
        warn(`  ⚠️  ${ENTRY_FILENAME}: no markdown headers found`);
    }

    return valid;
}

function validateMetadataFile(slug, metaPath, isExternal) {
    let metadata;

    try {
        metadata = JSON.parse(fs.readFileSync(metaPath, "utf8"));
    } catch (err) {
        error(`  ❌ ${METADATA_FILENAME}: invalid JSON: ${err.message}`);

        return false;
    }

    let valid = true;
    const required = isExternal ? METADATA_REQUIRED_EXTERNAL : METADATA_REQUIRED_LOCAL;

    for (const field of required) {
        if (!(field in metadata)) {
            error(`  ❌ ${METADATA_FILENAME}: missing required field "${field}"`);
            valid = false;
        }
    }

    if (!valid) return false;

    if (metadata.source !== undefined) {
        const s = metadata.source;
        if (typeof s !== "object" || s === null || typeof s.url !== "string" || !/^https?:\/\//.test(s.url)) {
            error(`  ❌ ${METADATA_FILENAME}: source.url must be a valid http(s) URL`);
            valid = false;
        }
        if (s && s.homepage !== undefined && (typeof s.homepage !== "string" || !/^https?:\/\//.test(s.homepage))) {
            error(`  ❌ ${METADATA_FILENAME}: source.homepage must be a valid http(s) URL`);
            valid = false;
        }
        if (s && s.license !== undefined && typeof s.license !== "string") {
            error(`  ❌ ${METADATA_FILENAME}: source.license must be a string`);
            valid = false;
        }
    }

    if (isExternal && (typeof metadata.description !== "string" || metadata.description.length === 0 || metadata.description.length > 150)) {
        error(`  ❌ ${METADATA_FILENAME}: description must be a non-empty string (≤150 chars) for external entries`);
        valid = false;
    }

    const checks = [
        {
            field: "title",
            ok: (v) => typeof v === "string" && v.length > 0 && v.length <= 80,
            msg: "must be a non-empty string, max 80 chars",
        },
        {
            field: "category",
            ok: (v) => VALID_CATEGORIES.includes(v),
            msg: `must be one of: ${VALID_CATEGORIES.join(", ")}`,
        },
        {
            field: "stack",
            ok: (v) => Array.isArray(v) && v.length > 0 && v.every((t) => typeof t === "string" && t.length > 0),
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
            ok: (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v),
            msg: "must be an ISO date string (YYYY-MM-DD)",
        },
        {
            field: "complexity",
            ok: (v) => VALID_COMPLEXITY.includes(v),
            msg: `must be one of: ${VALID_COMPLEXITY.join(", ")}`,
        },
    ];

    for (const c of checks) {
        if (!c.ok(metadata[c.field])) {
            error(`  ❌ ${METADATA_FILENAME}: ${c.field}: ${c.msg}`);
            valid = false;
        }
    }

    if (metadata.title && metadata.title.length > 60) {
        warn(`  ⚠️  ${METADATA_FILENAME}: title is long (${metadata.title.length} chars)`);
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

    const entryPath = path.join(specDir, ENTRY_FILENAME);
    const metaPath = path.join(specDir, METADATA_FILENAME);

    if (!fs.existsSync(metaPath)) {
        error(`  ❌ Missing metadata file: ${METADATA_FILENAME}`);

        return false;
    }

    let probeMetadata;
    try {
        probeMetadata = JSON.parse(fs.readFileSync(metaPath, "utf8"));
    } catch {
        probeMetadata = {};
    }
    const isExternal = !!(probeMetadata && probeMetadata.source && typeof probeMetadata.source.url === "string");

    if (!isExternal && !fs.existsSync(entryPath)) {
        error(`  ❌ Missing entry file: ${ENTRY_FILENAME} (required for local entries; set metadata.source.url for external)`);

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
            error(`  ❌ Disallowed file extension: ${rel}`);
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

    if (!isExternal && !validateSpecFile(slug, entryPath)) valid = false;
    if (!validateMetadataFile(slug, metaPath, isExternal)) valid = false;

    if (valid) {
        const tag = isExternal ? " (external)" : "";

        success(`  ✅ Valid${tag} (${fileCount} file${fileCount === 1 ? "" : "s"}, ${totalBytes} bytes)`);
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
    if (!validateSpecDirectory(target)) allValid = false;
}

log("");

if (allValid) {
    success("✅ All specs valid!");
    process.exit(0);
} else {
    error("❌ Validation failed!");
    process.exit(1);
}
