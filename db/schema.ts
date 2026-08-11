import { pgTable, text, integer, timestamp, pgEnum } from "drizzle-orm/pg-core";

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

export const votes = pgTable("votes", {
  id: text("id").primaryKey(),
  variationId: text("variation_id")
    .notNull()
    .references(() => variations.id, { onDelete: "cascade" }),
  direction: voteDirection("direction").notNull(),
  comment: text("comment"),
  voterName: text("voter_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Voter = typeof voters.$inferSelect;
export type NewVoter = typeof voters.$inferInsert;
export type Variation = typeof variations.$inferSelect;
export type NewVariation = typeof variations.$inferInsert;
export type Vote = typeof votes.$inferSelect;
export type NewVote = typeof votes.$inferInsert;
