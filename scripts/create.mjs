#!/usr/bin/env node
// scripts/create.mjs
import { randomBytes } from "node:crypto";
import { writeFileSync, existsSync, mkdirSync, chmodSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const AGENT_CONFIG_DIR = join(homedir(), ".variation-voter");
const AGENT_CONFIG_PATH = join(AGENT_CONFIG_DIR, "config");

function parseArgs(argv) {
  const args = {
    force: false,
    yes: false,
    databaseUrl: undefined,
    baseUrl: undefined,
    writeAgentConfig: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const [flag, inlineValue] = arg.includes("=") ? arg.split(/=(.*)/s) : [arg, undefined];

    const takeValue = () => {
      if (inlineValue !== undefined) return inlineValue;
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("-")) {
        console.error(`Missing value for ${flag}`);
        process.exit(1);
      }
      i++;
      return next;
    };

    switch (flag) {
      case "--force":
        args.force = true;
        break;
      case "--yes":
      case "-y":
        args.yes = true;
        break;
      case "--database-url":
        args.databaseUrl = takeValue();
        break;
      case "--base-url":
        args.baseUrl = takeValue();
        break;
      case "--write-agent-config":
        args.writeAgentConfig = true;
        break;
      case "--help":
      case "-h":
        printHelp();
        process.exit(0);
        break;
      default:
        console.error(`Unknown flag: ${flag}`);
        printHelp();
        process.exit(1);
    }
  }

  return args;
}

function printHelp() {
  console.log(`Usage: node scripts/create.mjs [options]

Options:
  --force                 Overwrite an existing .env.local (and, with
                           --write-agent-config, an existing agent config)
  --yes, -y                Skip interactive prompts; use flags/env values
                            and generated defaults
  --database-url <url>     Postgres connection string (interactively: falls
                            back to a prompt; with --yes: falls back to
                            $DATABASE_URL, then errors if still unset)
  --base-url <url>         Public base URL (interactively: falls back to a
                            prompt; with --yes: falls back to
                            $PUBLIC_BASE_URL, then http://localhost:3000)
  --write-agent-config      Also write ~/.variation-voter/config with
                            VARIATION_VOTER_URL and VARIATION_VOTER_ADMIN_TOKEN
                            for the agent skill to use
  -h, --help                Show this help
`);
}

function looksLikePostgresUrl(url) {
  return /^postgres(ql)?:\/\//i.test(url);
}

function looksLikeHttpUrl(url) {
  return /^https?:\/\//i.test(url);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  // --yes/-y is the sole switch for non-interactive mode (not TTY detection):
  // this script is spawned with piped stdin both by human-facing test
  // harnesses that still want the prompt flow, and by agents that pass
  // --yes plus explicit flags/env for a fully unattended run.
  const interactive = !args.yes;

  const envLocalExists = existsSync(".env.local");
  if (envLocalExists && !args.force) {
    console.error(
      ".env.local already exists — remove it first, or re-run with --force if you want to overwrite it."
    );
    process.exit(1);
  }

  let rl;
  let ask = async () => "";
  if (interactive) {
    rl = createInterface({ input: process.stdin, output: process.stdout });
    // Read answers via the readline interface's async iterator rather than
    // sequential rl.question() calls. When input is piped and closed right
    // away (e.g. `echo "a\nb" | script` or a spawned child process test),
    // rl.question() has a race: both "line" events can fire before the
    // second question() call has subscribed its one-time listener, silently
    // dropping the second answer and letting the process exit once stdin
    // ends. Pulling from the shared async iterator avoids that race.
    const lines = rl[Symbol.asyncIterator]();
    ask = async (prompt) => {
      process.stdout.write(prompt);
      const { value } = await lines.next();
      return value ?? "";
    };
  }

  if (envLocalExists && args.force) {
    if (interactive) {
      const confirm = await ask(".env.local exists — overwrite it? (y/N): ");
      if (!/^y(es)?$/i.test(confirm.trim())) {
        console.log("Aborted. .env.local left untouched.");
        rl.close();
        process.exit(1);
      }
    }
    // Non-interactive with --force: proceed without asking.
  }

  // process.env fallbacks are for the non-interactive/unattended path only
  // (e.g. an agent spawning this script with --yes). In interactive mode we
  // always prompt rather than silently picking up whatever DATABASE_URL/
  // PUBLIC_BASE_URL happen to be set in the caller's shell.
  let databaseUrl = args.databaseUrl ?? (!interactive ? process.env.DATABASE_URL : undefined) ?? "";
  if (!databaseUrl && interactive) {
    databaseUrl = await ask("Neon DATABASE_URL (postgres://...): ");
  }
  databaseUrl = databaseUrl.trim();

  let baseUrl = args.baseUrl ?? (!interactive ? process.env.PUBLIC_BASE_URL : undefined) ?? "";
  if (!baseUrl && interactive) {
    baseUrl = await ask(
      "Public base URL (e.g. https://your-app.vercel.app) [http://localhost:3000]: "
    );
  }
  baseUrl = baseUrl.trim() || "http://localhost:3000";

  let writeAgentConfig = args.writeAgentConfig;
  if (!args.writeAgentConfig && interactive) {
    const answer = await ask(
      "Also write ~/.variation-voter/config for the agent skill to use? (y/N): "
    );
    writeAgentConfig = /^y(es)?$/i.test(answer.trim());
  }

  if (rl) rl.close();

  if (!interactive && !databaseUrl) {
    console.error(
      "DATABASE_URL is required in non-interactive mode. Pass --database-url <url> or set $DATABASE_URL."
    );
    process.exit(1);
  }

  if (!databaseUrl) {
    console.warn("Warning: DATABASE_URL is empty — you'll need to set it before running migrations.");
  } else if (!looksLikePostgresUrl(databaseUrl)) {
    console.warn(
      `Warning: "${databaseUrl}" doesn't look like a Postgres connection string (expected postgres:// or postgresql://).`
    );
  }

  if (!looksLikeHttpUrl(baseUrl)) {
    console.warn(`Warning: "${baseUrl}" doesn't look like a valid http(s) URL.`);
  }

  const adminToken = randomBytes(24).toString("hex");
  const cronSecret = randomBytes(24).toString("hex");

  const contents = [
    `DATABASE_URL=${databaseUrl}`,
    `ADMIN_TOKEN=${adminToken}`,
    `CRON_SECRET=${cronSecret}`,
    `PUBLIC_BASE_URL=${baseUrl}`,
    "",
  ].join("\n");

  writeFileSync(".env.local", contents);
  console.log("\nWrote .env.local with a generated ADMIN_TOKEN and CRON_SECRET.");

  if (writeAgentConfig) {
    if (existsSync(AGENT_CONFIG_PATH) && !args.force) {
      console.log(
        `Skipped ~/.variation-voter/config — it already exists. Re-run with --force to overwrite it.`
      );
    } else {
      mkdirSync(AGENT_CONFIG_DIR, { recursive: true });
      const agentConfigContents = [
        `VARIATION_VOTER_URL=${baseUrl}`,
        `VARIATION_VOTER_ADMIN_TOKEN=${adminToken}`,
        "",
      ].join("\n");
      writeFileSync(AGENT_CONFIG_PATH, agentConfigContents, { mode: 0o600 });
      chmodSync(AGENT_CONFIG_PATH, 0o600);
      console.log(`Wrote ${AGENT_CONFIG_PATH} (mode 600) for the agent skill.`);
    }
  }

  console.log("\nNext steps:");
  console.log("  1. npm install");
  console.log("  2. npm run db:migrate     # migrate your local/dev database");
  console.log("  3. npm run dev            # try it locally");
  console.log("  4. vercel link");
  console.log(
    "  5. vercel env add DATABASE_URL && vercel env add ADMIN_TOKEN && vercel env add CRON_SECRET && vercel env add PUBLIC_BASE_URL"
  );
  console.log(
    "  6. DATABASE_URL=<your-prod-connection-string> npx drizzle-kit migrate   # migrate the production database once"
  );
  console.log("  7. vercel deploy --prod");
}

main();
