---
name: node-cli
description: "TypeScript CLI scaffold with argument parsing, interactive prompts, and auto-generated docs."
---

## What's included

A **TypeScript 5.4** CLI scaffold built on **Commander.js v12** for argument parsing and **Ink v5** for rich terminal UI. The spec includes a **plugin system** so users can extend the CLI with additional commands without modifying the core source. **TypeDoc 0.26** generates HTML API documentation from JSDoc comments automatically.

Configuration resolves from three sources in priority order: `~/.config/<tool>/config.json` (user-level), environment variables prefixed with the tool's uppercase name, and explicit flags. A built-in `config` command lets users view and set configuration interactively. A **Zod** schema validates the resolved config at startup and produces a clear error message with the config file path when something is wrong.

**Vitest** covers command parsing, configuration resolution, and interactive prompt flows. **Changesets** manages versioning and `CHANGELOG.md`. Releases are automated via a GitHub Actions workflow that publishes to npm on version-tag push.

## Architecture

**Commands are self-contained modules.** Each command lives in `src/commands/<name>.ts`, exports a `register(program: Command) => void` function, and has a corresponding test. The entry point (`src/index.ts`) imports all command modules and calls `register` — it contains no business logic.

```ts
// src/commands/init.ts
import { Command } from 'commander';
import { render } from 'ink';
import { InitWizard } from '../ui/InitWizard.js';

export function register(program: Command): void {
  program
    .command('init [project-name]')
    .description('Scaffold a new project')
    .option('--template <name>', 'project template', 'default')
    .option('--no-git', 'skip git initialisation')
    .action(async (projectName, opts) => {
      await runInit({ projectName, ...opts });
    });
}

async function runInit(opts: InitOptions): Promise<void> {
  if (!opts.projectName) {
    const { waitUntilExit } = render(<InitWizard onComplete={runInit} />);
    await waitUntilExit();
    return;
  }
  // non-interactive path: scaffold directly
}
```

**UI components are pure Ink, no Commander references inside.** Components in `src/ui/` accept typed props and invoke callbacks — no Commander access from inside a component. This lets the same component render in tests via `ink-testing-library` without a full CLI context.

**Plugin discovery is file-system based.** At startup the CLI scans `node_modules` for packages matching `<tool-name>-plugin-*`, loads their manifest, and calls their `register` function. Plugins declare a minimum CLI version in `package.json`; incompatible plugins are skipped with a warning rather than crashing.

```ts
// Plugin contract (published as @your-tool/plugin-types)
export interface CliPlugin {
  name: string;
  version: string;
  minCliVersion: string;
  register: (program: Command, ctx: PluginContext) => void;
}
```

**Config validation is a Zod schema evaluated at startup.** Unknown keys are stripped; missing required keys produce a readable error that includes the config file path and the specific field name. The validated config is typed throughout the rest of the application.

## File structure

```
src/
├── index.ts               Entry point: parse args, load plugins, run
├── cli.ts                 Commander program definition, version, global opts
├── commands/
│   ├── init.ts            `<tool> init` command
│   ├── config.ts          `<tool> config get|set|list`
│   └── update.ts          `<tool> update` — self-update via npm
├── ui/
│   ├── InitWizard.tsx     Multi-step init flow (Ink)
│   ├── Spinner.tsx        Loading indicator
│   ├── SelectInput.tsx    Arrow-key selection (ink-select-input)
│   └── TextInput.tsx      Single-line text prompt (ink-text-input)
├── config/
│   ├── schema.ts          Zod schema for config file + env vars
│   ├── loader.ts          Resolution order: file → env → flags
│   └── paths.ts           XDG Base Dir paths (os.homedir, XDG_CONFIG_HOME)
├── plugins/
│   ├── loader.ts          Discovers and loads plugin packages from node_modules
│   └── types.ts           CliPlugin interface (also published separately to npm)
└── utils/
    ├── errors.ts          CliError base class with exit-code mapping
    └── output.ts          stdout/stderr helpers, --json flag support

tests/
├── commands/
│   ├── init.test.ts
│   └── config.test.ts
├── ui/
│   └── InitWizard.test.tsx   ink-testing-library component tests
└── config/
    └── loader.test.ts        Config resolution precedence and validation tests

.changeset/                Changesets for per-PR versioning
.github/
└── workflows/
    ├── ci.yml             lint + typecheck + test
    └── release.yml        Changesets publish to npm on version merge
```

## Getting started

```bash
# 1. Scaffold the project
npx specdriven add spec node-cli

# 2. Install dependencies
pnpm install

# 3. Set your tool identity
# Edit package.json: set "name", "bin", and "description"
# Edit src/cli.ts: update the program name, description, and version string

# 4. Build and link globally
pnpm build          # tsc → dist/
pnpm link --global  # makes `<your-tool>` available in your shell

# 5. Verify
<your-tool> --help
<your-tool> config list

# 6. Test
pnpm test           # Vitest unit + component tests
pnpm typecheck      # tsc --noEmit
pnpm lint           # ESLint + Prettier check
```

To cut a release:

```bash
pnpm changeset        # document what changed (opens editor)
pnpm version          # bump versions + update CHANGELOG.md
git push && git push --tags   # triggers release.yml → npm publish
```

## Opinionated choices, with reasons

- **Commander.js over yargs or oclif.** Commander has the cleanest API for composable sub-command CLIs, the lightest runtime (~50 KB), and stable maintenance. Yargs has similar power but the magic-option-generation behaviour is often surprising. oclif is excellent for large plugin-based CLIs (Heroku, Salesforce) but brings a heavier project structure than most tools warrant.
- **Ink over chalk + readline.** Ink is React for the terminal — declarative, composable, testable. chalk + readline produces imperative state machines that are hard to test and break under terminal resize. Ink pays for itself the moment you have a multi-step wizard or a live-updating progress display.
- **Vitest over Jest.** Shared config with Vite-based web projects, faster watch mode, and native ESM support. The main win on TypeScript CLI projects is eliminating the Jest + ts-jest + ESM transformer configuration that reliably causes pain.
- **Changesets over `npm version` + manual changelog.** Each PR contributes a changeset file that documents the change type and description. On release, Changesets assembles the `CHANGELOG.md` and bumps package versions correctly. `npm version` is fine for solo projects; Changesets scale to teams and monorepos.
- **pnpm over npm or yarn.** Strict hoisting (no phantom dependencies), fast installs, and a content-addressable store for disk efficiency. Strict dependency isolation matters for CLI packages — a phantom dep that works locally but is missing in an end-user's install is a runtime crash.
- **XDG Base Directory for config paths.** `~/.config/<tool>/` on Linux, `~/Library/Application Support/<tool>/` on macOS via the `env-paths` package. Respects `XDG_CONFIG_HOME`. Never write config to the user's home directory root — it clutters dotfiles and ignores the user's configured preference.
- **`--json` flag on all machine-readable commands.** Piping CLI output to `jq` is a primary use case for scripted environments. Any command that lists or describes resources must support `--json` and emit newline-delimited JSON to stdout.

## Testing strategy

**Unit tests** cover configuration loading (resolution priority, Zod validation, malformed input), command option parsing (required flags, defaults, aliases), and utility functions. These run in milliseconds with no I/O.

**Component tests** use `ink-testing-library` to render Ink components in a virtual terminal. Tests assert on rendered text, simulate arrow-key and Enter keystrokes, and check callback invocations. The `InitWizard` tests cover the full multi-step flow including field validation and back-navigation.

**Integration tests** invoke the compiled CLI as a subprocess via `child_process.spawn` and assert on stdout, stderr, and exit codes. These cover the golden path of each command and error paths (malformed config, missing required arguments, permission denied on config write).

## Skills paired with this spec

- `test-writer` — Vitest + ink-testing-library patterns for commands and interactive prompts
- `api-designer` — designs the REST API contract and generates typed client code when the CLI communicates with a backend
- `code-reviewer` — reviews command structure, plugin API surface, and TypeScript patterns for consistency

Install individually with `npx specdriven add skill <slug>`, or accept them all when you install this spec.

## When this spec is the wrong fit

- **Thin shell wrapper with no interactivity.** If your CLI is a thin wrapper around system commands with no prompts or rich output, a Bash or zsh script is simpler and ships without a Node runtime dependency.
- **GUI application.** Use Electron or Tauri. Ink renders exclusively to the terminal.
- **High-frequency scripted usage (called thousands of times).** Node's startup time (~50–100 ms for a compiled CLI) accumulates. For performance-critical scripting, use a compiled binary (Go, Rust) or Python.
- **Deno or Bun environment.** Commander.js and Ink work in both runtimes but the build, config, and publishing workflows in this spec assume Node.js and pnpm.
