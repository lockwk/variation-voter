import { z } from "zod";

export const createVoterSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
  expiresInDays: z.number().int().nonnegative().max(365).optional(),
});

export const addVariationSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
  kind: z.enum(["url", "image", "embed"]),
  src: z.string().trim().min(1),
});

export const castVoteSchema = z.object({
  direction: z.enum(["up", "down"]),
  comment: z.string().trim().max(1000).optional(),
  voterName: z.string().trim().max(100).optional(),
});

export const updateVoteSchema = z
  .object({
    comment: z.string().trim().max(1000).optional(),
    voterName: z.string().trim().max(100).optional(),
  })
  .refine((data) => data.comment !== undefined || data.voterName !== undefined, {
    message: "Provide a comment or voterName",
  });
