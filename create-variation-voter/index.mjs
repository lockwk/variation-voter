#!/usr/bin/env node
// create-variation-voter/index.mjs
import { randomBytes } from "node:crypto";
import {
  writeFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { createInterface } from "node:readline/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const REPO_SLUG = "OWNER/REPO"; // TODO(Step R): replace with real owner/repo before publishing

async function fetchTarball(source) {
  if (source.startsWith("http")) {
    const res = await fetch(source);
    if (!res.ok) {
      throw new Error(`Failed to download app archive: ${res.status} ${res.statusText} (${source})`);
    }
    return Buffer.from(await res.arrayBuffer());
  }
  return readFileSync(source);
}

async function fetchAndExtract(target) {
  const source =
    process.env.VARIATION_VOTER_SOURCE ??
    `https://codeload.github.com/${REPO_SLUG}/tar.gz/refs/heads/main`;

  const tarballBytes = await fetchTarball(source);

  const tmpFile = join(tmpdir(), `variation-voter-${randomBytes(8).toString("hex")}.tar.gz`);
  writeFileSync(tmpFile, tarballBytes);

  try {
    try {
      execFileSync("tar", ["-xzf", tmpFile, "-C", target, "--strip-components=1"], {
        stdio: "inherit",
      });
    } catch (err) {
      if (err && err.code === "ENOENT") {
        throw new Error(
          "`tar` was not found on this system. Install tar (or extract the app manually) and try again."
        );
      }
      throw new Error(`Failed to extract app archive: ${err.message}`);
    }
  } finally {
    rmSync(tmpFile, { force: true });
  }
}

async function main() {
  const target = process.argv[2];
  if (!target) {
    console.error("Usage: npx create-variation-voter <dir>");
    process.exit(1);
  }

  let createdTarget = false;
  if (existsSync(target)) {
    if (readdirSync(target).length > 0) {
      console.error(`Target directory "${target}" already exists and is not empty.`);
      process.exit(1);
    }
  } else {
    mkdirSync(target, { recursive: true });
    createdTarget = true;
  }

  try {
    console.log(`Downloading Variation Voter into ${target}...`);
    await fetchAndExtract(target);

    const envPath = join(target, ".env.local");
    if (existsSync(envPath)) {
      console.error(".env.local already exists — remove it first if you want to re-run setup.");
      process.exit(1);
    }

    const rl = createInterface({ input: process.stdin, output: process.stdout });
    // Read answers via the readline interface's async iterator rather than
    // sequential rl.question() calls. When input is piped and closed right
    // away (e.g. `echo "a\nb" | script` or a spawned child process test),
    // rl.question() has a race: both "line" events can fire before the
    // second question() call has subscribed its one-time listener, silently
    // dropping the second answer and letting the process exit once stdin
    // ends. Pulling from the shared async iterator avoids that race.
    const lines = rl[Symbol.asyncIterator]();
    async function ask(prompt) {
      process.stdout.write(prompt);
      const { value } = await lines.next();
      return value ?? "";
    }

    const databaseUrl = await ask("Neon DATABASE_URL (postgres://...): ");
    const publicBaseUrl = await ask(
      "Public base URL (e.g. https://your-app.vercel.app) [http://localhost:3000]: "
    );
    rl.close();

    const adminToken = randomBytes(24).toString("hex");
    const cronSecret = randomBytes(24).toString("hex");

    const contents = [
      `DATABASE_URL=${databaseUrl.trim()}`,
      `ADMIN_TOKEN=${adminToken}`,
      `CRON_SECRET=${cronSecret}`,
      `PUBLIC_BASE_URL=${publicBaseUrl.trim() || "http://localhost:3000"}`,
      "",
    ].join("\n");

    writeFileSync(envPath, contents);

    console.log("\nWrote .env.local with a generated ADMIN_TOKEN and CRON_SECRET.");
    console.log("Next steps:");
    console.log(`  1. cd ${target}`);
    console.log("  2. npm install");
    console.log("  3. npm run db:migrate");
    console.log("  4. npm run dev            # try it locally");
    console.log(
      "  5. vercel link && vercel env add DATABASE_URL && vercel env add ADMIN_TOKEN && vercel env add CRON_SECRET"
    );
    console.log("  6. vercel deploy --prod");
  } catch (err) {
    if (createdTarget) rmSync(target, { recursive: true, force: true });
    throw err;
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
