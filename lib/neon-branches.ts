// Dependency-free Neon REST API client for per-workspace dev/test database
// branch isolation (KEV-187). DORMANT by default: every exported function
// here is a no-op (or actively refuses to run) unless a Neon API key is
// configured — see isConfigured() below. When unconfigured, every workspace
// keeps using today's shared dev (`damp-sky`) and test (`rapid-glade`)
// databases; nothing in this file changes that behavior, and no self-hoster
// ever needs to know it exists.
//
// Required env vars (set ONLY in the LOCAL ROOT's gitignored env files, which
// .worktreeinclude copies into every new workspace — see CLAUDE.md
// "Conductor: new-repo setup"). These are personal/local config, never part
// of the user-facing install flow:
//
//   NEON_API_KEY              Neon API key (console.neon.tech -> Account
//                              Settings -> API keys). Required to activate.
//   NEON_PROJECT_ID           The Neon project id that owns damp-sky /
//                              rapid-glade. Required to activate.
//   NEON_DEV_PARENT_BRANCH    Branch new per-workspace dev branches fork
//                              from. Default: "damp-sky".
//   NEON_TEST_PARENT_BRANCH   Branch new per-workspace test branches fork
//                              from. Default: "rapid-glade".
//
// Also gated on CONDUCTOR_IS_LOCAL === "1" (set by Conductor itself), so this
// can never activate in a cloud/remote workspace even if the above vars leak
// in some other way.
//
// Possible follow-up (out of scope for KEV-187): a pruning script for orphan
// cw/* branches left behind if an archive is skipped or interrupted.

const NEON_API_BASE = "https://console.neon.tech/api/v2";

export interface NeonConfig {
  apiKey: string;
  projectId: string;
  devParentBranch: string;
  testParentBranch: string;
}

/** Reads Neon config from process.env. Returns null when unconfigured. */
export function neonConfig(): NeonConfig | null {
  const apiKey = process.env.NEON_API_KEY;
  const projectId = process.env.NEON_PROJECT_ID;
  if (!apiKey || !projectId) {
    return null;
  }
  return {
    apiKey,
    projectId,
    devParentBranch: process.env.NEON_DEV_PARENT_BRANCH || "damp-sky",
    testParentBranch: process.env.NEON_TEST_PARENT_BRANCH || "rapid-glade",
  };
}

/**
 * The single switch this whole feature is gated on: true only when Neon
 * config is present AND we're in a local Conductor workspace. Callers
 * (scripts/provision-workspace-db.ts, scripts/teardown-workspace-db.ts)
 * check this before doing anything — when false, they no-op / fall back to
 * today's shared-DB behavior exactly.
 */
export function isConfigured(): boolean {
  return neonConfig() !== null && process.env.CONDUCTOR_IS_LOCAL === "1";
}

export type BranchKind = "dev" | "test";

/** Deterministic per-workspace branch name, e.g. "cw/monterrey-dev". */
export function branchName(workspace: string, kind: BranchKind): string {
  return `cw/${workspace}-${kind}`;
}

interface NeonBranch {
  id: string;
  name: string;
  parent_id?: string;
}

interface NeonDatabase {
  name: string;
  owner_name: string;
}

function requireConfig(): NeonConfig {
  const config = neonConfig();
  if (!config) {
    throw new Error(
      "lib/neon-branches: NEON_API_KEY/NEON_PROJECT_ID are not set. Callers must check isConfigured() before calling into this module.",
    );
  }
  return config;
}

async function neonFetch<T>(config: NeonConfig, pathAndQuery: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${NEON_API_BASE}${pathAndQuery}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Neon API ${init?.method ?? "GET"} ${pathAndQuery} failed: ${response.status} ${body}`);
  }
  return (await response.json()) as T;
}

async function listBranches(config: NeonConfig): Promise<NeonBranch[]> {
  const data = await neonFetch<{ branches: NeonBranch[] }>(config, `/projects/${config.projectId}/branches`);
  return data.branches;
}

async function findBranchByName(config: NeonConfig, name: string): Promise<NeonBranch | undefined> {
  const branches = await listBranches(config);
  return branches.find((branch) => branch.name === name);
}

export interface WorkspaceBranch {
  branchId: string;
  /** Pooled connection URI (host contains "-pooler") — used at runtime. */
  pooledUri: string;
  /** Direct/unpooled connection URI — preferred for running migrations. */
  unpooledUri: string;
  /** Hostname of the unpooled endpoint; used as this branch's guard identity. */
  host: string;
}

/**
 * Looks up the deterministic branch for `{ workspace, kind }`, creating it
 * (forked from the configured dev/test parent) if it doesn't exist yet.
 * Idempotent: safe to call repeatedly, e.g. across repeated `setup` runs.
 */
export async function createOrReuseBranch({
  workspace,
  kind,
}: {
  workspace: string;
  kind: BranchKind;
}): Promise<WorkspaceBranch> {
  const config = requireConfig();
  const name = branchName(workspace, kind);

  let branch = await findBranchByName(config, name);
  if (!branch) {
    const parentName = kind === "dev" ? config.devParentBranch : config.testParentBranch;
    const parent = await findBranchByName(config, parentName);
    if (!parent) {
      throw new Error(
        `lib/neon-branches: parent branch "${parentName}" not found in project ${config.projectId}`,
      );
    }
    const created = await neonFetch<{ branch: NeonBranch }>(config, `/projects/${config.projectId}/branches`, {
      method: "POST",
      body: JSON.stringify({
        branch: { parent_id: parent.id, name },
        endpoints: [{ type: "read_write" }],
      }),
    });
    branch = created.branch;
  }

  const { databases } = await neonFetch<{ databases: NeonDatabase[] }>(
    config,
    `/projects/${config.projectId}/branches/${branch.id}/databases`,
  );
  const database = databases[0];
  if (!database) {
    throw new Error(`lib/neon-branches: branch "${name}" (${branch.id}) has no databases`);
  }

  const [pooled, unpooled] = await Promise.all([
    neonFetch<{ uri: string }>(
      config,
      `/projects/${config.projectId}/connection_uri?branch_id=${branch.id}&database_name=${database.name}&role_name=${database.owner_name}&pooled=true`,
    ),
    neonFetch<{ uri: string }>(
      config,
      `/projects/${config.projectId}/connection_uri?branch_id=${branch.id}&database_name=${database.name}&role_name=${database.owner_name}&pooled=false`,
    ),
  ]);

  return {
    branchId: branch.id,
    pooledUri: pooled.uri,
    unpooledUri: unpooled.uri,
    host: new URL(unpooled.uri).hostname,
  };
}

/**
 * Deletes the deterministic branch for `{ workspace, kind }` if it exists.
 * No-op (returns `{ deleted: false }`) if it was never created or already
 * deleted — archive hooks may run more than once.
 */
export async function deleteBranch({
  workspace,
  kind,
}: {
  workspace: string;
  kind: BranchKind;
}): Promise<{ deleted: boolean }> {
  const config = requireConfig();
  const name = branchName(workspace, kind);
  const branch = await findBranchByName(config, name);
  if (!branch) {
    return { deleted: false };
  }
  await neonFetch(config, `/projects/${config.projectId}/branches/${branch.id}`, { method: "DELETE" });
  return { deleted: true };
}
