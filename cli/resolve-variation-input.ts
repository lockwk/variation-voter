export function resolveVariationInput(options: {
  url?: string;
  image?: string;
  embed?: string;
}): ["url" | "image" | "embed", string] {
  if (options.url) return ["url", options.url];
  if (options.image) return ["image", options.image];
  if (options.embed) return ["embed", options.embed];
  throw new Error("One of --url, --image, or --embed is required");
}
