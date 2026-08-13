CREATE TABLE "comments" (
	"id" text PRIMARY KEY NOT NULL,
	"variation_id" text NOT NULL,
	"viewer_id" text,
	"comment" text NOT NULL,
	"voter_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_variation_id_variations_id_fk" FOREIGN KEY ("variation_id") REFERENCES "public"."variations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "comments_variation_viewer_unique" ON "comments" USING btree ("variation_id","viewer_id");--> statement-breakpoint
INSERT INTO "comments" ("id","variation_id","viewer_id","comment","voter_name","created_at") SELECT "id","variation_id","viewer_id","comment","voter_name","created_at" FROM "votes" WHERE "comment" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "votes" DROP COLUMN "comment";--> statement-breakpoint
ALTER TABLE "votes" DROP COLUMN "voter_name";