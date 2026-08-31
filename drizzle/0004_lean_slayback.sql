CREATE TYPE "public"."comment_anchor_type" AS ENUM('element', 'point');--> statement-breakpoint
CREATE TYPE "public"."comment_status" AS ENUM('open', 'complete');--> statement-breakpoint
DROP INDEX "comments_variation_viewer_unique";--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN "anchor_type" "comment_anchor_type" DEFAULT 'point' NOT NULL;--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN "selector" text;--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN "offset_x" real;--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN "offset_y" real;--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN "status" "comment_status" DEFAULT 'open' NOT NULL;