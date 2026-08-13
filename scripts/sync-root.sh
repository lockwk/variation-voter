#!/usr/bin/env bash
# sync-root.sh — keep the local Conductor repo ROOT current on its base branch.
#
# Why: Conductor's "Files to copy" / .worktreeinclude read gitignored files
# (e.g. .env.local) from the LOCAL ROOT working tree when a workspace is created.
# Merges land on origin/<base>, but the local root only advances when pulled, so
# it can go stale and copy nothing. Running this from scripts.setup fast-forwards
# the root on each create, keeping it fresh for the NEXT workspace.
#
# Best-effort and safe: local-only, no interactive prompts, fast-forward only,
# never touches a dirty/diverged root, never fails workspace setup.
set -u

# Cloud workspaces: ROOT == workspace, no base-branch var — nothing to sync.
[ "${CONDUCTOR_IS_LOCAL:-0}" = "1" ] || exit 0

ROOT="${CONDUCTOR_ROOT_PATH:-}"
BRANCH="${CONDUCTOR_DEFAULT_BRANCH:-}"
[ -n "$ROOT" ] && [ -n "$BRANCH" ] || exit 0

# Only sync when the root is actually checked out on the base branch.
CUR="$(git -C "$ROOT" symbolic-ref --short -q HEAD || true)"
if [ "$CUR" != "$BRANCH" ]; then
  echo "sync-root: root on '${CUR:-detached}', not '$BRANCH'; skipping"
  exit 0
fi

if GIT_TERMINAL_PROMPT=0 git -C "$ROOT" fetch --quiet origin "$BRANCH" \
   && git -C "$ROOT" merge --ff-only "origin/$BRANCH" >/dev/null 2>&1; then
  echo "sync-root: root fast-forwarded to origin/$BRANCH"
else
  echo "sync-root: skipped (root not fast-forwardable, offline, or auth needed)"
fi
exit 0
