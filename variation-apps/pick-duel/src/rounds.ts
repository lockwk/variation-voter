export type Option = {
  id: string;
  label: string;
  emoji: string;
  tag: string;
};

export type Round = {
  id: string;
  prompt: string;
  options: [Option, Option];
};

export const rounds: Round[] = [
  {
    id: "brew",
    prompt: "Fuel of choice",
    options: [
      { id: "coffee", label: "Coffee", emoji: "☕", tag: "wired" },
      { id: "tea", label: "Tea", emoji: "🍵", tag: "steady" },
    ],
  },
  {
    id: "clock",
    prompt: "You come alive at...",
    options: [
      { id: "dawn", label: "Sunrise", emoji: "🌅", tag: "early" },
      { id: "midnight", label: "Midnight", emoji: "🌙", tag: "nocturnal" },
    ],
  },
  {
    id: "escape",
    prompt: "Dream getaway",
    options: [
      { id: "beach", label: "Beach", emoji: "🏖️", tag: "chill" },
      { id: "peaks", label: "Mountains", emoji: "⛰️", tag: "wild" },
    ],
  },
  {
    id: "plate",
    prompt: "Snack attack",
    options: [
      { id: "sweet", label: "Sweet", emoji: "🍪", tag: "soft" },
      { id: "savory", label: "Savory", emoji: "🧀", tag: "bold" },
    ],
  },
  {
    id: "company",
    prompt: "Ideal Friday night",
    options: [
      { id: "crowd", label: "Big crowd", emoji: "🎉", tag: "social" },
      { id: "solo", label: "Just me", emoji: "📚", tag: "quiet" },
    ],
  },
];

export type Archetype = {
  title: string;
  blurb: string;
};

// Very small heuristic: score every option's tag and pick the archetype whose
// keywords appear most often among the picks. Falls back to a balanced type.
export function archetypeFor(pickedTags: string[]): Archetype {
  const counts = new Map<string, number>();
  for (const tag of pickedTags) counts.set(tag, (counts.get(tag) ?? 0) + 1);

  const wild = counts.get("wild") ?? 0;
  const bold = counts.get("bold") ?? 0;
  const nocturnal = counts.get("nocturnal") ?? 0;
  const wired = counts.get("wired") ?? 0;
  const social = counts.get("social") ?? 0;
  const chill = counts.get("chill") ?? 0;
  const quiet = counts.get("quiet") ?? 0;
  const soft = counts.get("soft") ?? 0;

  const highEnergy = wild + bold + nocturnal + wired + social;
  const lowEnergy = chill + quiet + soft;

  if (highEnergy - lowEnergy >= 3) {
    return {
      title: "Chaos Gremlin",
      blurb: "You run on midnight snacks and bad decisions. Never change.",
    };
  }
  if (lowEnergy - highEnergy >= 3) {
    return {
      title: "Soft Life Enjoyer",
      blurb: "Slow mornings, quiet nights, zero regrets. Peak comfort.",
    };
  }
  return {
    title: "Chaotic Balanced",
    blurb: "Half hermit, half main character. Depends on the day.",
  };
}
