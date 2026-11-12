"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { getCollapsed, setCollapsed } from "@/lib/sidebar";

/* ============================================================
 * DESKTOP ONLY: sidebar collapse / expand toggle.
 * This is the logo button that lives at the top of the sidebar.
 *   - Expanded → full TaskHub logo; collapsed → icon logo.
 * It is rendered only by the desktop shell; mobile has no sidebar.
 * ============================================================ */
export default function SidebarToggle() {
  const [collapsed, setCollapsedState] = useState(false);

  useEffect(() => {
    const sync = () => setCollapsedState(getCollapsed());
    sync();
    window.addEventListener("tt:sidebar", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("tt:sidebar", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const label = collapsed ? "Expand sidebar" : "Collapse sidebar";
  const logoSrc = collapsed ? "/logo/taskhub-icon.svg" : "/logo/taskhub-full.svg";

  return (
    <button
      type="button"
      onClick={() => setCollapsed(!getCollapsed())}
      aria-expanded={!collapsed}
      aria-controls="app-sidebar"
      title={label}
      aria-label={label}
      className="sb-toggle"
    >
      <Image
        src={logoSrc}
        alt="TaskHub"
        width={collapsed ? 634 : 844}
        height={collapsed ? 550 : 369}
        unoptimized
        className={collapsed ? "h-8 w-8 object-contain" : "h-9 w-auto"}
      />
    </button>
  );
}
