ALTER TABLE "votes" ADD COLUMN "viewer_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "votes_variation_viewer_unique" ON "votes" USING btree ("variation_id","viewer_id");