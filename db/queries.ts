import { and, eq, isNotNull, sql } from "drizzle-orm";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "./schema";
import { voters, variations, votes } from "./schema";
import { newId } from "@/lib/ids";

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
  comments: { id: string; comment: string; voterName: string | null; createdAt: Date }[];
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

export async function getVoterDetail(db: Database, voterId: string): Promise<VoterDetail | null> {
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
    .groupBy(variations.id);

  const commentRows = await db
    .select({
      id: votes.id,
      variationId: votes.variationId,
      comment: votes.comment,
      voterName: votes.voterName,
      createdAt: votes.createdAt,
    })
    .from(votes)
    .innerJoin(variations, eq(variations.id, votes.variationId))
    .where(and(eq(variations.voterId, voterId), isNotNull(votes.comment)))
    .orderBy(sql`${votes.createdAt} desc`);

  const variationsWithAggregates: VariationWithAggregates[] = rows.map((row) => ({
    ...row,
    score: row.up - row.down,
    comments: commentRows
      .filter((c) => c.variationId === row.id && c.comment)
      .map((c) => ({
        id: c.id,
        comment: c.comment as string,
        voterName: c.voterName,
        createdAt: c.createdAt,
      })),
  }));

  return { ...voter, variations: variationsWithAggregates };
}

export async function castVote(
  db: Database,
  variationId: string,
  input: { direction: "up" | "down"; comment?: string; voterName?: string }
) {
  const id = newId();
  const [vote] = await db.insert(votes).values({ id, variationId, ...input }).returning();
  return vote;
}

export async function attachCommentToVote(
  db: Database,
  voteId: string,
  variationId: string,
  input: { comment?: string; voterName?: string }
) {
  const [vote] = await db
    .update(votes)
    .set(input)
    .where(and(eq(votes.id, voteId), eq(votes.variationId, variationId)))
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
