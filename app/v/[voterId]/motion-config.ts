import type { Transition } from "motion/react";

// The single shared spring the voter UI's Motion adoption is built around
// (see voter-shell.tsx's <MotionConfig transition={HOUSE_SPRING}>) — calm,
// low-bounce, so every entrance/exit/pin-drop across the app reads as one
// consistent physical feel instead of a pile of individually-tuned
// components. Most motion.* elements in this subtree don't need to import
// this directly: MotionConfig makes it the default `transition` for anything
// that doesn't specify its own.
export const HOUSE_SPRING: Transition = { type: "spring", duration: 0.4, bounce: 0.15 };
