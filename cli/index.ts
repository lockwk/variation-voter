#!/usr/bin/env node
import { config } from "dotenv";
config({ path: ".env.local" });

import { Command } from "commander";
import { zipSync } from "fflate";
import {
  createVoterRequest,
  addVariationRequest,
  addAppRequest,
  listVotersRequest,
  closeVoterRequest,
  deleteVoterRequest,
} from "./api-client";
import { getCliConfig } from "./config";
import { resolveVariationInput } from "./resolve-variation-input";
import { readDirToMap } from "./read-dir-to-map";

const program = new Command();
program.name("voter");

program
  .command("create <title>")
  .option("--description <description>")
  .option("--expires-in-days <days>", "override the default 7-day expiry", (v) => Number(v))
  .action(async (title, options) => {
    const result = await createVoterRequest({
      title,
      description: options.description,
      expiresInDays: options.expiresInDays,
    });
    console.log(`Created voter ${result.voter.id}`);
    console.log(result.shareUrl);
  });

program
  .command("add <voterId>")
  .requiredOption("--title <title>")
  .option("--description <description>")
  .option("--url <url>", "no longer supported — creating new url variations is blocked")
  .option("--image <url>")
  .option("--embed <html>")
  .action(async (voterId, options) => {
    const [kind, src] = resolveVariationInput(options);
    const result = await addVariationRequest(voterId, {
      title: options.title,
      description: options.description,
      kind,
      src,
    });
    console.log(`Added variation ${result.variation.id} (${kind})`);
  });

program
  .command("add-app <voterId>")
  .requiredOption("--title <title>")
  .option("--description <description>")
  .requiredOption("--dir <distDir>", "the built Vite output directory")
  .action(async (voterId, options) => {
    const fileMap = await readDirToMap(options.dir);
    const zipInput: Record<string, Uint8Array> = {};
    for (const [relativePath, data] of fileMap) zipInput[relativePath] = data;
    const zipBytes = zipSync(zipInput);

    const result = await addAppRequest(voterId, {
      title: options.title,
      description: options.description,
      zipBytes,
    });
    console.log(`Added app variation ${result.variation.id} → ${result.variation.src}`);
  });

program.command("list").action(async () => {
  const result = await listVotersRequest();
  if (result.voters.length === 0) {
    console.log("No voters yet.");
    return;
  }
  for (const voter of result.voters) {
    console.log(`${voter.id}  ${voter.title}  [${voter.status}]  expires ${voter.expiresAt}`);
  }
});

program.command("link <voterId>").action((voterId) => {
  const { baseUrl } = getCliConfig();
  console.log(`${baseUrl}/v/${voterId}`);
});

program.command("close <voterId>").action(async (voterId) => {
  await closeVoterRequest(voterId);
  console.log(`Archived voter ${voterId}`);
});

program.command("delete <voterId>").action(async (voterId) => {
  await deleteVoterRequest(voterId);
  console.log(`Deleted voter ${voterId}`);
});

program.parseAsync();
