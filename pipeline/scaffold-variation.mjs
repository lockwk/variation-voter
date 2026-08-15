#!/usr/bin/env node
// pipeline/scaffold-variation.mjs
//
// Deterministic glue for the agent-driven variation pipeline (see
// .claude/skills/build-variation-voter/SKILL.md). Copies
// variation-apps/_template/ into a fresh per-run, per-slug scaffold under
// .variations/<runId>/<slug>/, ready for a build subagent to replace src/
// and run `npm run build`. Copies node_modules straight from the template
// (it's pre-installed) instead of re-running `npm install` for every
// variation — much faster when scaffolding N variations in a batch. Falls
// back to `npm install` only if the template (or the copy) turns out not to
// have node_modules.
//
// Usage:
//   node pipeline/scaffold-variation.mjs <slug> [--run <runId>] [--force]

import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HELP = `Usage: node pipeline/scaffold-variation.mjs <slug> [--run <runId>] [--force]

Copies variation-apps/_template/ into .variations/<runId>/<slug>/, a fresh
scaffold ready for a build subagent to implement (edit src/, then
\`npm run build\`) and produce a local ./dist.

Arguments:
  <slug>            Variation slug, must match [a-z0-9-]+ (e.g. "pill-nav")

Options:
  --run <runId>     Group scaffolds under a shared run id (default: run-<timestamp>)
  --force           Overwrite an existing non-empty destination directory
  --help, -h        Show this help and exit
`;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

function parseArgs(argv) {
  const args = { slug: undefined, run: undefined, force: false, help: false };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else if (arg === "--force") {
      args.force = true;
    } else if (arg === "--run") {
      const value = argv[++i];
      if (value === undefined) throw new Error("--run requires a value");
      args.run = value;
    } else if (arg.startsWith("--run=")) {
      args.run = arg.slice("--run=".length);
    } else if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    } else {
      positional.push(arg);
    }
  }
  args.slug = positional[0];
  return args;
}

function fail(message) {
  console.error(`Error: ${message}`);
  process.exit(1);
}

function isNonEmptyDir(dir) {
  return existsSync(dir) && readdirSync(dir).length > 0;
}

function hasNodeModules(dir) {
  return existsSync(path.join(dir, "node_modules"));
}

function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
    return;
  }

  if (args.help) {
    console.log(HELP);
    return;
  }

  if (!args.slug) {
    console.error(HELP);
    fail("Missing required <slug> argument.");
    return;
  }
  if (!/^[a-z0-9-]+$/.test(args.slug)) {
    fail(`Invalid slug "${args.slug}" — must match [a-z0-9-]+`);
    return;
  }

  const runId = args.run || `run-${Date.now()}`;

  const templateDir = path.join(repoRoot, "variation-apps", "_template");
  if (!existsSync(templateDir)) {
    fail(`Template not found at ${templateDir}. Expected variation-apps/_template/ to exist.`);
    return;
  }

  const destDir = path.join(repoRoot, ".variations", runId, args.slug);

  if (isNonEmptyDir(destDir)) {
    if (!args.force) {
      fail(
        `Destination already exists and is non-empty: ${destDir}\n` +
          `Pass --force to overwrite, or choose a different --run/slug.`
      );
      return;
    }
    rmSync(destDir, { recursive: true, force: true });
  }

  mkdirSync(path.dirname(destDir), { recursive: true });
  cpSync(templateDir, destDir, { recursive: true });

  if (!hasNodeModules(templateDir) || !hasNodeModules(destDir)) {
    console.log("No node_modules found in template/copy — running `npm install` as a fallback...");
    const result = spawnSync("npm", ["install"], { cwd: destDir, stdio: "inherit" });
    if (result.status !== 0) {
      fail(`npm install failed in ${destDir} (exit code ${result.status})`);
      return;
    }
  }

  const distDir = path.join(destDir, "dist");

  // Machine-friendly lines first (easy for a caller to grep/parse), then a
  // human-readable summary.
  console.log(`SCAFFOLD_PATH=${destDir}`);
  console.log(`DIST_PATH=${distDir}`);
  console.log(`Scaffolded "${args.slug}" (run ${runId}) at ${destDir} — build it, then find output at ${distDir}`);
}

main();
