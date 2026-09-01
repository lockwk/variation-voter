const MINUTE = 60;
const HOUR = MINUTE * 60;
const DAY = HOUR * 24;
const MONTH = DAY * 30;
const YEAR = DAY * 365;

function plural(value: number, unit: string): string {
  return `${value} ${unit}${value === 1 ? "" : "s"} ago`;
}

/**
 * Formats `date` relative to `now` (defaults to the current time) for comment
 * timestamps (H1) — e.g. "2 hours ago". Anything under a minute reads as
 * "just now", which also covers the "just now" timestamp H2 calls for on an
 * optimistically prepended own-comment.
 */
export function relativeTimeFrom(date: Date, now: Date = new Date()): string {
  const diffSeconds = Math.max(0, Math.round((now.getTime() - date.getTime()) / 1000));

  if (diffSeconds < MINUTE) return "just now";
  if (diffSeconds < HOUR) return plural(Math.floor(diffSeconds / MINUTE), "minute");
  if (diffSeconds < DAY) return plural(Math.floor(diffSeconds / HOUR), "hour");
  if (diffSeconds < MONTH) return plural(Math.floor(diffSeconds / DAY), "day");
  if (diffSeconds < YEAR) return plural(Math.floor(diffSeconds / MONTH), "month");
  return plural(Math.floor(diffSeconds / YEAR), "year");
}
