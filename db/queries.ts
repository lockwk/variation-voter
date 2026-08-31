import { and, eq, isNull, sql } from "drizzle-orm";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "./schema";
import { voters, variations, votes, comments } from "./schema";
import type { Vote, Variation, Comment } from "./schema";
import { newId } from "@/lib/ids";
import { getStorage } from "@/lib/storage";

// Re-exported so UI code (annotation-layer.tsx, comments-panel.tsx,
// voter-shell.tsx) can type the server-confirmed comment row a POST/PATCH
// response carries — importantly including the frozen `seq` pin number
// (KEV-172 chunk 4) — without reaching into "@/db/schema" directly.
export type { Comment } from "./schema";

// Postgres' `= NULL` never matches (even other NULLs), so a "does this row
// belong to this viewer" condition needs isNull() when the viewer is unknown
// rather than eq(col, null) — used by getVoterDetail's viewer-vote lookup.
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
  /** How this pin is positioned: against a CSS selector, or a raw x/y point. */
  anchorType: Comment["anchorType"];
  /** CSS selector to re-resolve the pin's element at render time, when anchorType is "element". */
  selector: string | null;
  /** X offset (percentage of the variation frame) for a "point" anchor. */
  offsetX: number | null;
  /** Y offset (percentage of the variation frame) for a "point" anchor. */
  offsetY: number | null;
  /** Whether this pin is still open or has been marked complete. */
  status: Comment["status"];
  /** Frozen 1-based pin number within its variation (KEV-172 chunk 4) — the
   * first comment on a variation is always 1, the second always 2, etc.,
   * regardless of deletes elsewhere in the list. See createComment. */
  seq: number;
};

/**
 * The anchor fields needed to create (or optimistically render) a pin
 * comment — the subset of `VariationComment` the stage annotation layer
 * (KEV-172 chunk 3) collects when a viewer drops a pin, shared by the
 * composer's POST body and the optimistic insert in voter-shell.tsx.
 */
export type CommentAnchorInput = {
  anchorType: Comment["anchorType"];
  selector: string | null;
  offsetX: number | null;
  offsetY: number | null;
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
      anchorType: comments.anchorType,
      selector: comments.selector,
      offsetX: comments.offsetX,
      offsetY: comments.offsetY,
      status: comments.status,
      seq: comments.seq,
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
        anchorType: c.anchorType,
        selector: c.selector,
        offsetX: c.offsetX,
        offsetY: c.offsetY,
        status: c.status,
        seq: c.seq,
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
 * Creates a new pin comment on a variation. Comments live in their own
 * table, independent of whether the viewer has voted, so this always
 * succeeds. Unlike the old one-comment-per-viewer model, a viewer can drop
 * many pins on the same variation — this always inserts a new row rather
 * than upserting in place.
 */
export async function createComment(
  db: Database,
  input: {
    variationId: string;
    viewerId: string;
    comment: string;
    voterName?: string;
    anchorType?: Comment["anchorType"];
    selector?: string;
    offsetX?: number;
    offsetY?: number;
  }
) {
  // Assigns a frozen, monotonic pin number (KEV-172 chunk 4): "first comment
  // is #1 forever", never reused even after a delete. neon-http has no
  // interactive transactions, so this can't be a single atomic "read max + 1,
  // then insert" — instead it's one race-safe UPDATE...RETURNING that bumps
  // the variation's own counter (Postgres row-level locking makes two
  // concurrent bumps on the same row serialize correctly), then an INSERT
  // using the value that UPDATE returned. If the INSERT then fails, the
  // bumped counter isn't rolled back — that's an acceptable numbering gap;
  // what must never happen is two comments sharing (or a comment reusing) a
  // seq, which this guarantees.
  const [bumped] = await db
    .update(variations)
    .set({ commentSeq: sql`${variations.commentSeq} + 1` })
    .where(eq(variations.id, input.variationId))
    .returning({ commentSeq: variations.commentSeq });
  if (!bumped) {
    throw new Error(`createComment: no such variation ${input.variationId}`);
  }

  const id = newId();
  const [comment] = await db
    .insert(comments)
    .values({ id, seq: bumped.commentSeq, ...input })
    .returning();
  return comment;
}

/**
 * Marks a pin comment open/complete. Any viewer of the voter may do this
 * (not just the comment's original author) — scoped only by comment id.
 * Returns null if no row matches.
 */
export async function updateCommentStatus(
  db: Database,
  input: { id: string; status: Comment["status"] }
) {
  const [comment] = await db
    .update(comments)
    .set({ status: input.status })
    .where(eq(comments.id, input.id))
    .returning();
  return comment ?? null;
}

/**
 * Deletes a pin comment. Any viewer of the voter may do this (not just the
 * comment's original author) — scoped only by comment id. Returns whether a
 * row was deleted.
 */
export async function deleteComment(db: Database, input: { id: string }) {
  const deleted = await db
    .delete(comments)
    .where(eq(comments.id, input.id))
    .returning({ id: comments.id });
  return deleted.length > 0;
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
