import { pgTable, text, integer, timestamp, pgEnum, uniqueIndex, real, type AnyPgColumn } from "drizzle-orm/pg-core";

export const voterStatus = pgEnum("voter_status", ["active", "archived"]);
export const variationKind = pgEnum("variation_kind", ["image", "embed", "app"]);
export const voteDirection = pgEnum("vote_direction", ["up", "down"]);
export const commentAnchorType = pgEnum("comment_anchor_type", ["element", "point"]);
export const commentStatus = pgEnum("comment_status", ["open", "complete"]);

export const voters = pgTable("voters", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  status: voterStatus("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
});

export const variations = pgTable("variations", {
  id: text("id").primaryKey(),
  voterId: text("voter_id")
    .notNull()
    .references(() => voters.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  kind: variationKind("kind").notNull(),
  src: text("src").notNull(),
  position: integer("position").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  // Monotonic per-variation counter for pin numbering (KEV-172 chunk 4): bumped
  // by one on every new comment, and never decremented or reused, so a pin's
  // assigned `comments.seq` (see below) stays frozen — "first pin is #1
  // forever" — even after older pins are deleted. See createComment's
  // UPDATE...RETURNING for how this is bumped race-safely without a
  // transaction (neon-http has none).
  commentSeq: integer("comment_seq").notNull().default(0),
});

export const votes = pgTable(
  "votes",
  {
    id: text("id").primaryKey(),
    variationId: text("variation_id")
      .notNull()
      .references(() => variations.id, { onDelete: "cascade" }),
    // Anonymous viewer identity (the `vv_viewer` cookie). Nullable to keep
    // pre-existing seed rows (inserted before this column existed) valid —
    // Postgres treats NULLs as distinct in a unique index, so those rows never
    // collide with each other or with real votes. Every new vote sets this,
    // which is what makes the unique index below enforce "one vote per viewer
    // per variation".
    viewerId: text("viewer_id"),
    direction: voteDirection("direction").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("votes_variation_viewer_unique").on(table.variationId, table.viewerId)]
);

export const comments = pgTable("comments", {
  id: text("id").primaryKey(),
  variationId: text("variation_id")
    .notNull()
    .references(() => variations.id, { onDelete: "cascade" }),
  // Anonymous viewer identity (the `vv_viewer` cookie). Nullable for the same
  // reason as votes.viewerId above — Postgres treats NULLs as distinct in a
  // unique index, so rows with an unknown viewer never collide with each
  // other. Comments are now positioned "pin" comments: a viewer can drop many
  // of them on the same variation, so there is no unique (variationId,
  // viewerId) index here anymore.
  viewerId: text("viewer_id"),
  comment: text("comment").notNull(),
  voterName: text("voter_name"),
  // Pin placement. An "element" anchor stores a CSS `selector` re-resolved at
  // render time; a "point" anchor stores a raw x/y offset (percentage of the
  // variation frame) as a fallback when no stable selector applies. Defaults
  // to 'point' with null selector/offsets so pre-pin legacy rows (backfilled
  // by the migration that added these columns) remain valid without needing
  // real coordinates.
  anchorType: commentAnchorType("anchor_type").notNull().default("point"),
  selector: text("selector"),
  offsetX: real("offset_x"),
  offsetY: real("offset_y"),
  status: commentStatus("status").notNull().default("open"),
  // Frozen pin number within its variation (KEV-172 chunk 4), assigned once at
  // insert time from `variations.comment_seq` and never reassigned — see that
  // column's comment and createComment. Default 0 only matters for the
  // migration's own DDL step; the same migration backfills every existing row
  // to a real 1-based number before the column is relied on anywhere.
  seq: integer("seq").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  // Flat-thread replies (KEV-183): null means this row IS a root pin comment
  // (what annotation-layer.tsx renders a numbered pin marker for); non-null
  // points at the root comment this row replies to. Threads are exactly one
  // level deep by product decision — a reply's own parentCommentId is always
  // null-checked server-side (see createReply in db/queries.ts) so a reply
  // can never itself become a parent ("no reply-to-a-reply"). onDelete
  // cascade means deleting a root comment takes its whole reply thread with
  // it, same as deleting a variation already cascades its comments.
  // Replies reuse the root's `seq` numbering scheme by NOT participating in
  // it at all — they're never assigned a real seq (left at the column
  // default 0) and never bump variations.commentSeq, since they're never
  // rendered as their own pin.
  parentCommentId: text("parent_comment_id").references((): AnyPgColumn => comments.id, { onDelete: "cascade" }),
});

export type Voter = typeof voters.$inferSelect;
export type NewVoter = typeof voters.$inferInsert;
export type Variation = typeof variations.$inferSelect;
export type NewVariation = typeof variations.$inferInsert;
export type Vote = typeof votes.$inferSelect;
export type NewVote = typeof votes.$inferInsert;
export type Comment = typeof comments.$inferSelect;
export type NewComment = typeof comments.$inferInsert;
