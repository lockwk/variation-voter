import { z } from "zod";

export const createVoterSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
  expiresInDays: z.number().int().nonnegative().max(365).optional(),
});

// Note: "app" is intentionally excluded here. App variations must be created
// via the dedicated `POST /apps` upload route, which stores a bundle in
// storage and derives `src` from it — this generic schema has no bundle to
// back a `kind:"app"` entry, so allowing it here would let a caller create a
// broken app variation with an arbitrary `src` and no bundle behind it.
//
// KEV-172: new "url" variations are blocked at creation too, via the
// `.refine` below rather than dropping it from the `kind` enum outright — a
// dedicated refine gives callers (the admin API, cli/index.ts's `add`
// command) a specific, actionable error message instead of zod's generic
// "invalid enum value". `url` is a cross-origin iframe with no same-document
// DOM to hit-test, so it can't support pinned comments the way `app`/`image`/
// `embed` do (see app/v/[voterId]/annotation-layer.tsx) — every other
// variation kind now places comments exclusively via pins, so a kind with no
// pin support has no way to comment on it at all. Existing `url` rows are
// untouched (the `variation_kind` DB enum still includes it, see
// db/schema.ts) and keep rendering read-only; full removal is a follow-up.
export const addVariationSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(2000).optional(),
    kind: z.enum(["url", "image", "embed"]),
    src: z.string().trim().min(1),
  })
  .refine((data) => data.kind !== "url", {
    message:
      'Creating new "url" variations is no longer supported — cross-origin content can\'t support pinned comments. Use "embed" or "image" instead.',
    path: ["kind"],
  });

export const castVoteSchema = z.object({
  direction: z.enum(["up", "down"]),
});

// Pin placement mirrors the `comments` table (see db/schema.ts): an
// "element" anchor must carry a non-empty CSS `selector`; a "point" anchor
// (the default) carries a raw x/y offset instead, expressed as a fraction
// (0–1) of the variation frame. All anchor fields are optional so legacy
// callers that only send { comment, voterName } keep working — createComment
// falls back to the column defaults (anchorType "point", null selector).
// `parentCommentId` (KEV-183): present only on a reply — flags the request
// to the POST route as "create a flat-thread reply", not a new pin. Left
// optional/nullable so every existing root-comment caller (a new pin drop)
// keeps working unchanged. Flat-threading itself (the parent must be a root,
// not another reply) can't be validated by zod alone since it needs a DB
// lookup — that check lives server-side in createReply (db/queries.ts).
export const commentSchema = z
  .object({
    comment: z.string().trim().min(1).max(1000),
    voterName: z.string().trim().max(100).optional(),
    anchorType: z.enum(["element", "point"]).optional(),
    selector: z.string().trim().min(1).optional().nullable(),
    offsetX: z.number().min(0).max(1).optional().nullable(),
    offsetY: z.number().min(0).max(1).optional().nullable(),
    parentCommentId: z.string().trim().min(1).optional().nullable(),
  })
  .refine((data) => data.anchorType !== "element" || !!data.selector, {
    message: "selector is required when anchorType is 'element'",
    path: ["selector"],
  });

export const commentStatusSchema = z.object({
  status: z.enum(["open", "complete"]),
});
