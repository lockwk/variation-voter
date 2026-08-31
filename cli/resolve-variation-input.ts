// KEV-172: --url is still accepted as a recognized flag (see cli/index.ts's
// `add` command) purely so a caller who types it gets this specific, clear
// error rather than commander's generic "unknown option" — new "url"
// variations can't be created at all anymore (see lib/validation.ts's
// addVariationSchema for why: they're a cross-origin iframe with no
// same-document DOM to hit-test, so they can't support pinned comments the
// way every other variation kind now requires).
export function resolveVariationInput(options: {
  url?: string;
  image?: string;
  embed?: string;
}): ["image" | "embed", string] {
  if (options.url) {
    throw new Error(
      '--url is no longer supported — creating new "url" variations is blocked (cross-origin content can\'t support pinned comments). Use --image or --embed instead.'
    );
  }
  if (options.image) return ["image", options.image];
  if (options.embed) return ["embed", options.embed];
  throw new Error("One of --image or --embed is required");
}
