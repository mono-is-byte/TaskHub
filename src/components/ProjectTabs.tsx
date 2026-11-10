"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Project sub-navigation (Board, Table, Timeline …). The active tab is derived
 * from the current pathname (`/p/<id>/<tab>`), so it survives refreshes and
 * direct links — no local state. Styling matches the app chrome and flips
 * with dark mode.
 */
export default function ProjectTabs({
  projectId,
  tabs,
  accent,
}: {
  projectId: string;
  /** [slug, label] pairs, already permission-filtered by the layout. */
  tabs: readonly (readonly [string, string])[];
  accent: string;
}) {
  const pathname = usePathname();
  const base = `/p/${projectId}`;

  return (
    <nav className="flex flex-wrap gap-1 text-sm" aria-label="Project sections">
      {tabs.map(([slug, label]) => {
        const href = `${base}/${slug}`;
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={slug}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`rounded-md px-2.5 py-1.5 text-sm transition-colors ${
              active
                ? "font-semibold text-[#FFFFFF] shadow-sm"
                : "text-[var(--text-secondary)] hover:bg-[var(--row-hover)] hover:text-[var(--text)]"
            }`}
            style={active ? { background: "#708AF4" } : undefined}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
