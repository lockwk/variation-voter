import type { BundleStorage } from "./types";
import { LocalFsBundleStorage } from "./local-fs";
import { VercelBlobBundleStorage } from "./vercel-blob";

export type { BundleStorage, StoredFile } from "./types";

let instance: BundleStorage | null = null;

/**
 * Get the process-wide `BundleStorage` driver.
 *
 * Selection is env-driven: when `BLOB_READ_WRITE_TOKEN` is set (the
 * deployed/Vercel case) bundles are stored in Vercel Blob; otherwise they're
 * stored on the local filesystem under `.bundles/` (local dev / self-host
 * baseline). The instance is memoized for the life of the process.
 *
 * The token is provisioned per Vercel environment, so production and non-prod
 * (preview/dev) resolve to different Blob stores automatically — see docs/deploy.md.
 */
export function getStorage(): BundleStorage {
  if (instance) return instance;

  const token = process.env.BLOB_READ_WRITE_TOKEN;
  instance = token ? new VercelBlobBundleStorage(token) : new LocalFsBundleStorage();
  return instance;
}
