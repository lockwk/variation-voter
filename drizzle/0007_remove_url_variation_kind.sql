DELETE FROM "variations" WHERE "kind" = 'url';
--> statement-breakpoint
CREATE TYPE "public"."variation_kind_new" AS ENUM('image', 'embed', 'app');
--> statement-breakpoint
ALTER TABLE "variations" ALTER COLUMN "kind" TYPE "public"."variation_kind_new" USING "kind"::text::"public"."variation_kind_new";
--> statement-breakpoint
DROP TYPE "public"."variation_kind";
--> statement-breakpoint
ALTER TYPE "public"."variation_kind_new" RENAME TO "variation_kind";
