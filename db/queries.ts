import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "./schema";
import { voters, variations, votes } from "./schema";
import type { Vote } from "./schema";
import { newId } from "@/lib/ids";

// Postgres' `= NULL` never matches (even other NULLs), so a "does this row
// belong to this viewer" condition needs isNull() when the viewer is unknown
// rather than eq(col, null) — used by toggleVote, attachCommentToVote, and
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
  input: { title: string; description?: string; kind: "url" | "image" | "embed"; src: string }
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

export async function closeVoter(db: Database, voterId: string) {
  const [voter] = await db
    .update(voters)
    .set({ status: "archived", archivedAt: new Date() })
    .where(eq(voters.id, voterId))
    .returning();
  return voter ?? null;
}

export async function deleteVoter(db: Database, voterId: string) {
  const [voter] = await db.delete(voters).where(eq(voters.id, voterId)).returning();
  return voter ?? null;
}

export type VoteDirection = "up" | "down";

export type VariationComment = {
  id: string;
  comment: string;
  voterName: string | null;
  createdAt: Date;
  direction: VoteDirection;
  /** True when this comment's vote belongs to the current viewer. */
  isOwn: boolean;
};

export type VariationWithAggregates = {
  id: string;
  title: string;
  description: string | null;
  kind: "url" | "image" | "embed";
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

  const commentRows = await db
    .select({
      id: votes.id,
      variationId: votes.variationId,
      comment: votes.comment,
      voterName: votes.voterName,
      createdAt: votes.createdAt,
      direction: votes.direction,
      viewerId: votes.viewerId,
    })
    .from(votes)
    .innerJoin(variations, eq(variations.id, votes.variationId))
    .where(and(eq(variations.voterId, voterId), isNotNull(votes.comment)))
    .orderBy(sql`${votes.createdAt} desc`);

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
      .filter((c) => c.variationId === row.id && c.comment)
      .map((c) => ({
        id: c.id,
        comment: c.comment as string,
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
  input: { direction: "up" | "down"; comment?: string; voterName?: string; viewerId?: string }
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
 * Attaches a comment/voterName to the viewer's current vote on a variation
 * (comments are gated behind having voted, and always ride along on the vote
 * row rather than a separate table). Returns null when the viewer has no
 * current vote to attach to.
 */
export async function attachCommentToVote(
  db: Database,
  variationId: string,
  viewerId: string,
  input: { comment?: string; voterName?: string }
) {
  const [vote] = await db
    .update(votes)
    .set(input)
    .where(and(eq(votes.variationId, variationId), eq(votes.viewerId, viewerId)))
    .returning();
  return vote ?? null;
}

export async function purgeExpiredAndArchivedVoters(db: Database, now: Date, archiveGraceMs: number) {
  const graceDeadline = new Date(now.getTime() - archiveGraceMs);
  const deleted = await db
    .delete(voters)
    .where(
      sql`${voters.expiresAt} < ${now} or (${voters.status} = 'archived' and ${voters.archivedAt} < ${graceDeadline})`
    )
    .returning({ id: voters.id });
  return deleted.map((row) => row.id);
}
