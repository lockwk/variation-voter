import type { ReactNode } from "react";
import { notFound } from "next/navigation";

/**
 * Home for throwaway design/motion experiments — reachable in local `next
 * dev` and on Vercel preview deployments, but never on production.
 *
 * Gated on `VERCEL_ENV`, deliberately NOT `NODE_ENV`: Vercel builds preview
 * deployments in production mode, so `NODE_ENV === "production"` is true for
 * BOTH prod and preview and would wrongly hide this route on preview too.
 * `VERCEL_ENV` is `"production"` only on the actual production deployment,
 * `"preview"` on preview deploys, and unset when running locally — so this
 * check allows local + preview and 404s everything under `/playground` on
 * prod, via `notFound()` in this shared layout (so every route below it,
 * present and future, inherits the gate for free).
 */
export default function PlaygroundLayout({ children }: { children: ReactNode }) {
  if (process.env.VERCEL_ENV === "production") notFound();

  return (
    <div className="flex min-h-full flex-1 flex-col bg-primary text-primary">
      <header className="flex items-center gap-2 border-b border-secondary px-4 py-3">
        <span className="text-xs font-semibold tracking-wide text-tertiary uppercase">
          Playground (dev only)
        </span>
      </header>
      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  );
}
