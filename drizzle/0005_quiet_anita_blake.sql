ALTER TABLE "comments" ADD COLUMN "seq" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "variations" ADD COLUMN "comment_seq" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- Safety-net belt-and-suspenders (KEV-175): 0004 already dropped this index,
-- but it drifted back on some DBs. IF EXISTS makes this a no-op there.
DROP INDEX IF EXISTS "comments_variation_viewer_unique";--> statement-breakpoint
-- Backfill: number every existing comment 1, 2, 3... per variation, ordered by
-- created_at (id as a stable tiebreaker for same-instant rows).
UPDATE "comments" c
SET "seq" = sub.rn
FROM (
  SELECT id, row_number() OVER (PARTITION BY variation_id ORDER BY created_at ASC, id ASC) AS rn
  FROM "comments"
) sub
WHERE c.id = sub.id;--> statement-breakpoint
-- Backfill: point each variation's counter at the highest seq just assigned
-- above, so the next createComment continues from there instead of restarting
-- at 1 (which would collide with — and duplicate — existing pin numbers).
UPDATE "variations" v
SET "comment_seq" = sub.max_seq
FROM (
  SELECT variation_id, max(seq) AS max_seq
  FROM "comments"
  GROUP BY variation_id
) sub
WHERE v.id = sub.variation_id;