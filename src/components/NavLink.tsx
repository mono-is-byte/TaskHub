"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Change request Phase 6: sidebar/topbar navigation links mark the ACTIVE tab
 * (current route) with an accent pill so users always know where they are.
 * `exact` matches only the exact path (used for "/"); child routes count as
 * active otherwise (e.g. /p/x/board lights up "Projects" children).
 * Sidebar toggle change request: `title` doubles as the tooltip + accessible
 * name, which is what icon-only (collapsed) navigation relies on while the
 * visible label is hidden by CSS.
 */
export default function NavLink({
  href,
  exact = false,
  className = "",
  title,
  children,
}: {
  href: string;
  exact?: boolean;
  className?: string;
  title?: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname() ?? "";
  const active = exact
    ? pathname === href
    : pathname === href || pathname.startsWith(href === "/" ? "/\u0000" : `${href}/`);

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      aria-label={title}
      title={title}
      className={`inline-flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors ${
        active
          ? "bg-[rgba(112,138,244,0.12)] font-semibold text-[#708AF4]"
          : "text-[var(--text-secondary)] hover:bg-[var(--row-hover)] hover:text-[var(--text)]"
      } ${className}`}
    >
      {children}
    </Link>
  );
}
