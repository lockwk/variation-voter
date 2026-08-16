import { and, eq, isNull, sql } from "drizzle-orm";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "./schema";
import { voters, variations, votes, comments } from "./schema";
import type { Vote, Variation } from "./schema";
import { newId } from "@/lib/ids";
import { getStorage } from "@/lib/storage";

// Postgres' `= NULL` never matches (even other NULLs), so a "does this row
// belong to this viewer" condition needs isNull() when the viewer is unknown
// rather than eq(col, null) — used by toggleVote, upsertComment, and
// getVoterDetail's viewer-vote lookup.
function viewerCondition(viewerId: string | null) {
  return viewerId === null ? isNull(votes.viewerId) : eq(votes.viewerId, viewerId);
}

export type Database = NeonHttpDatabase<typeof schema>;

const DEFAULT_EXPIRY_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

export async function createVoter(
  db: Database,
  input: { title: string; description?: string; expiresInDays?: number }
) {
  const id = newId();
  const expiresAt = new Date(Date.now() + (input.expiresInDays ?? DEFAULT_EXPIRY_DAYS) * DAY_MS);
  const [voter] = await db
    .insert(voters)
    .values({ id, title: input.title, description: input.description, expiresAt })
    .returning();
  return voter;
}

export async function listVoters(db: Database) {
  return db.select().from(voters).orderBy(voters.createdAt);
}

export async function addVariation(
  db: Database,
  voterId: string,
  input: { title: string; description?: string; kind: Variation["kind"]; src: string }
) {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(variations)
    .where(eq(variations.voterId, voterId));
  const id = newId();
  const [variation] = await db
    .insert(variations)
    .values({ id, voterId, position: count, ...input })
    .returning();
  return variation;
}

/**
 * Update a variation's `src` in place. Used by the app-upload endpoint,
 * which creates the variation row with a `"pending"` placeholder src (so the
 * id exists before the bundle is stored), then points it at the served
 * `/apps/<id>/index.html` path once storage succeeds.
 */
export async function setVariationSrc(db: Database, variationId: string, src: string): Promise<Variation | null> {
  const [variation] = await db.update(variations).set({ src }).where(eq(variations.id, variationId)).returning();
  return variation ?? null;
}

export async function closeVoter(db: Database, voterId: string) {
  const [voter] = await db
    .update(voters)
    .set({ status: "archived", archivedAt: new Date() })
    .where(eq(voters.id, voterId))
    .returning();
  return voter ?? null;
}

// Best-effort deletion of app-variation storage bundles. A storage failure must
// never throw out of a DB delete, and one bundle's failure must not stop the rest.
async function deleteAppBundles(ids: string[]) {
  if (ids.length === 0) return;
  const storage = getStorage();
  for (const id of ids) {
    try {
      await storage.deleteBundle(id);
    } catch (error) {
      console.error(`Failed to delete bundle for app variation ${id}`, error);
    }
  }
}

export async function deleteVoter(db: Database, voterId: string) {
  const appVariationRows = await db
    .select({ id: variations.id })
    .from(variations)
    .where(and(eq(variations.kind, "app"), eq(variations.voterId, voterId)));

  const [voter] = await db.delete(voters).where(eq(voters.id, voterId)).returning();
  if (!voter) return null;

  await deleteAppBundles(appVariationRows.map((row) => row.id));
  return voter;
}

export type VoteDirection = "up" | "down";

export type VariationComment = {
  id: string;
  comment: string;
  voterName: string | null;
  createdAt: Date;
  /** The commenter's own vote direction on this variation, or null if they never voted. */
  direction: VoteDirection | null;
  /** True when this comment belongs to the current viewer. */
  isOwn: boolean;
};

export type VariationWithAggregates = {
  id: string;
  title: string;
  description: string | null;
  kind: Variation["kind"];
  src: string;
  position: number;
  createdAt: Date;
  up: number;
  down: number;
  score: number;
  /** The current viewer's own vote on this variation, or null if they haven't voted (or are unknown). */
  viewerVote: VoteDirection | null;
  comments: VariationComment[];
};

export type VoterDetail = {
  id: string;
  title: string;
  description: string | null;
  status: "active" | "archived";
  createdAt: Date;
  expiresAt: Date;
  archivedAt: Date | null;
  variations: VariationWithAggregates[];
};

export async function getVoterDetail(
  db: Database,
  voterId: string,
  viewerId: string | null = null
): Promise<VoterDetail | null> {
  const [voter] = await db.select().from(voters).where(eq(voters.id, voterId));
  if (!voter) return null;

  const rows = await db
    .select({
      id: variations.id,
      title: variations.title,
      description: variations.description,
      kind: variations.kind,
      src: variations.src,
      position: variations.position,
      createdAt: variations.createdAt,
      up: sql<number>`count(*) filter (where ${votes.direction} = 'up')::int`,
      down: sql<number>`count(*) filter (where ${votes.direction} = 'down')::int`,
    })
    .from(variations)
    .leftJoin(votes, eq(votes.variationId, variations.id))
    .where(eq(variations.voterId, voterId))
    .groupBy(variations.id)
    .orderBy(variations.position);

  // Comments live in their own table now (anyone can comment whether or not
  // they've voted), so a commenter's vote direction is a LEFT JOIN back onto
  // votes rather than something read off the same row. The join matches on
  // both variationId and viewerId; a NULL viewerId never equals another NULL
  // in Postgres, so an unknown-viewer comment correctly never joins to an
  // unknown-viewer vote — it just gets direction: null, same as a real viewer
  // who commented without voting.
  const commentRows = await db
    .select({
      id: comments.id,
      variationId: comments.variationId,
      comment: comments.comment,
      voterName: comments.voterName,
      createdAt: comments.createdAt,
      direction: votes.direction,
      viewerId: comments.viewerId,
    })
    .from(comments)
    .innerJoin(variations, eq(variations.id, comments.variationId))
    .leftJoin(votes, and(eq(votes.variationId, comments.variationId), eq(votes.viewerId, comments.viewerId)))
    .where(eq(variations.voterId, voterId))
    .orderBy(sql`${comments.createdAt} desc`);

  // The viewer's own current vote per variation, so the client can hydrate
  // (e.g. highlight the pressed thumb) without an extra round trip.
  const viewerVoteRows =
    viewerId === null
      ? []
      : await db
          .select({ variationId: votes.variationId, direction: votes.direction })
          .from(votes)
          .innerJoin(variations, eq(variations.id, votes.variationId))
          .where(and(eq(variations.voterId, voterId), viewerCondition(viewerId)));

  const variationsWithAggregates: VariationWithAggregates[] = rows.map((row) => ({
    ...row,
    score: row.up - row.down,
    viewerVote: viewerVoteRows.find((v) => v.variationId === row.id)?.direction ?? null,
    comments: commentRows
      .filter((c) => c.variationId === row.id)
      .map((c) => ({
        id: c.id,
        comment: c.comment,
        voterName: c.voterName,
        createdAt: c.createdAt,
        direction: c.direction,
        isOwn: viewerId !== null && c.viewerId === viewerId,
      })),
  }));

  return { ...voter, variations: variationsWithAggregates };
}

/**
 * Inserts a vote row directly, bypassing the one-vote-per-viewer toggle rule.
 * Kept for fixtures/seeding (and as the primitive `toggleVote` builds on) —
 * request-handling code should go through `toggleVote` instead so a viewer
 * can never accumulate more than one vote per variation.
 */
export async function castVote(
  db: Database,
  variationId: string,
  input: { direction: "up" | "down"; viewerId?: string }
) {
  const id = newId();
  const [vote] = await db.insert(votes).values({ id, variationId, ...input }).returning();
  return vote;
}

export type ToggleVoteResult =
  | { state: "added"; vote: Vote }
  | { state: "switched"; vote: Vote }
  | { state: "removed"; vote: null };

/**
 * Casts, switches, or undoes a viewer's vote on a variation so they can only
 * ever hold at most one vote per variation:
 *  - no existing vote for (variation, viewer)      -> insert ("added")
 *  - existing vote in the same direction            -> delete ("removed", undo)
 *  - existing vote in the opposite direction         -> update ("switched")
 */
export async function toggleVote(
  db: Database,
  variationId: string,
  viewerId: string,
  direction: "up" | "down"
): Promise<ToggleVoteResult> {
  const [existing] = await db
    .select()
    .from(votes)
    .where(and(eq(votes.variationId, variationId), eq(votes.viewerId, viewerId)));

  if (!existing) {
    const id = newId();
    const [vote] = await db.insert(votes).values({ id, variationId, viewerId, direction }).returning();
    return { state: "added", vote };
  }

  if (existing.direction === direction) {
    await db.delete(votes).where(eq(votes.id, existing.id));
    return { state: "removed", vote: null };
  }

  const [vote] = await db
    .update(votes)
    .set({ direction })
    .where(eq(votes.id, existing.id))
    .returning();
  return { state: "switched", vote };
}

/**
 * Creates or updates a viewer's comment on a variation. Comments now live in
 * their own table, independent of whether the viewer has voted, so this
 * always succeeds — a resubmission by the same (variationId, viewerId) pair
 * upserts in place (via the comments_variation_viewer_unique index) rather
 * than creating a duplicate comment.
 */
export async function upsertComment(
  db: Database,
  variationId: string,
  viewerId: string,
  input: { comment: string; voterName?: string }
) {
  const id = newId();
  const [comment] = await db
    .insert(comments)
    .values({ id, variationId, viewerId, comment: input.comment, voterName: input.voterName })
    .onConflictDoUpdate({
      target: [comments.variationId, comments.viewerId],
      set: input,
    })
    .returning();
  return comment;
}

export async function purgeExpiredAndArchivedVoters(db: Database, now: Date, archiveGraceMs: number) {
  const graceDeadline = new Date(now.getTime() - archiveGraceMs);
  const purgeCondition = sql`${voters.expiresAt} < ${now} or (${voters.status} = 'archived' and ${voters.archivedAt} < ${graceDeadline})`;

  // Collect ids of "app" variations belonging to the voters about to be
  // purged *before* deleting anything, so we know which storage bundles to
  // clean up once the DB delete (which cascades variations/votes/comments)
  // succeeds. One query, joined straight off the same purge condition.
  //
  // This SELECT and the cascading DELETE below are two separate statements,
  // not one transaction — the neon-http driver has no interactive
  // transaction support, so there's no way to wrap both in a single atomic
  // unit here. That leaves a tiny drift window where a voter could in theory
  // change between the two statements, but it's acceptable: the purge
  // condition only ever matches voters that are already expired or archived
  // past their grace period, states that don't get reversed, so nothing
  // meaningful can change out from under this in practice.
  const appVariationRows = await db
    .select({ id: variations.id })
    .from(variations)
    .innerJoin(voters, eq(voters.id, variations.voterId))
    .where(and(eq(variations.kind, "app"), purgeCondition));

  const deleted = await db.delete(voters).where(purgeCondition).returning({ id: voters.id });

  await deleteAppBundles(appVariationRows.map((row) => row.id));

  return deleted.map((row) => row.id);
}
