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
export const addVariationSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
  kind: z.enum(["url", "image", "embed"]),
  src: z.string().trim().min(1),
});

export const castVoteSchema = z.object({
  direction: z.enum(["up", "down"]),
});

export const commentSchema = z.object({
  comment: z.string().trim().min(1).max(1000),
  voterName: z.string().trim().max(100).optional(),
});
