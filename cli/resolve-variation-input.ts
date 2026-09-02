export function resolveVariationInput(options: { image?: string; embed?: string }): ["image" | "embed", string] {
  if (options.image) return ["image", options.image];
  if (options.embed) return ["embed", options.embed];
  throw new Error("One of --image or --embed is required");
}
