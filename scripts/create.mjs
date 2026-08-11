#!/usr/bin/env node
// scripts/create.mjs
import { randomBytes } from "node:crypto";
import { writeFileSync, existsSync } from "node:fs";
import { createInterface } from "node:readline/promises";

async function main() {
  if (existsSync(".env.local")) {
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

  writeFileSync(".env.local", contents);

  console.log("\nWrote .env.local with a generated ADMIN_TOKEN and CRON_SECRET.");
  console.log("Next steps:");
  console.log("  1. npm install");
  console.log("  2. npm run db:migrate");
  console.log("  3. npm run dev            # try it locally");
  console.log(
    "  4. vercel link && vercel env add DATABASE_URL && vercel env add ADMIN_TOKEN && vercel env add CRON_SECRET"
  );
  console.log("  5. vercel deploy --prod");
}

main();
