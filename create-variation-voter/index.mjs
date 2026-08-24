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
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const REPO_SLUG = "lockwk/variation-voter";

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

    const adminToken = randomBytes(24).toString("hex");
    const cronSecret = randomBytes(24).toString("hex");

    const contents = [
      `ADMIN_TOKEN=${adminToken}`,
      `CRON_SECRET=${cronSecret}`,
      "",
      "# Filled automatically by the Vercel-Neon integration (or `vercel env pull`).",
      "# For the manual path, paste your Neon direct/unpooled connection string here.",
      "# DATABASE_URL=",
      "",
      "# Set this to your deployed URL after the first deploy.",
      "# PUBLIC_BASE_URL=",
      "",
    ].join("\n");

    writeFileSync(envPath, contents);

    console.log("\nWrote .env.local with a generated ADMIN_TOKEN and CRON_SECRET.");
    console.log("Next steps:");
    console.log(`  1. cd ${target} && npm install`);
    console.log("  2. vercel link");
    console.log(
      "  3. vercel integration add neon --plan free_v3 -m auth=false   (accept terms in browser once; injects DATABASE_URL)"
    );
    console.log("  4. vercel blob create-store <name> --access public --yes       (injects BLOB_READ_WRITE_TOKEN)");
    console.log("  5. vercel env add ADMIN_TOKEN production   and   vercel env add CRON_SECRET production");
    console.log("  6. vercel --prod                                               (first deploy; runs migrations)");
    console.log("  7. set PUBLIC_BASE_URL to your deployed URL, then vercel --prod again");
    console.log("  8. verify, then set VARIATION_VOTER_URL + VARIATION_VOTER_ADMIN_TOKEN in .env.local");
  } catch (err) {
    if (createdTarget) rmSync(target, { recursive: true, force: true });
    throw err;
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
