import { pgTable, text, integer, timestamp, pgEnum, uniqueIndex } from "drizzle-orm/pg-core";

export const voterStatus = pgEnum("voter_status", ["active", "archived"]);
export const variationKind = pgEnum("variation_kind", ["url", "image", "embed"]);
export const voteDirection = pgEnum("vote_direction", ["up", "down"]);

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
    comment: text("comment"),
    voterName: text("voter_name"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("votes_variation_viewer_unique").on(table.variationId, table.viewerId)]
);

export type Voter = typeof voters.$inferSelect;
export type NewVoter = typeof voters.$inferInsert;
export type Variation = typeof variations.$inferSelect;
export type NewVariation = typeof variations.$inferInsert;
export type Vote = typeof votes.$inferSelect;
export type NewVote = typeof votes.$inferInsert;
