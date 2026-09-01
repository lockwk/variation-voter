import Link from "next/link";

/**
 * Index of playground exhibits. Adding exhibit #2 is just another folder
 * under `app/playground/` plus another entry in this list — no other
 * wiring needed, since the prod gate lives once in `layout.tsx` above.
 */
const EXHIBITS = [
  {
    href: "/playground/springs-vs-curves",
    title: "Card morph: spring vs ease-out-quad",
    description:
      "Pinned-comment card's minimized → expanded morph, side by side under the house spring and an ease-out-quad tween.",
  },
];

export default function PlaygroundIndexPage() {
  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <h1 className="text-lg font-semibold text-primary">Exhibits</h1>
      <ul className="flex flex-col gap-2">
        {EXHIBITS.map((exhibit) => (
          <li key={exhibit.href}>
            <Link
              href={exhibit.href}
              className="block rounded-lg border border-secondary bg-secondary px-4 py-3 transition-colors hover:border-primary"
            >
              <span className="block text-sm font-medium text-primary">{exhibit.title}</span>
              <span className="block text-sm text-tertiary">{exhibit.description}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
