"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { isMobileSidebarOpen, setMobileSidebarOpen } from "@/lib/sidebar";

/**
 * Mobile-only open-drawer trigger: a 32px TaskHub icon button placed inline to
 * the LEFT of the page's own <h1> title (so there is a single title, not a
 * duplicate). Hidden on desktop (returns null) and hidden while the drawer is
 * open (the drawer's Full logo takes over as the close control).
 */
export default function MobileTopBar() {
  const [mobile, setMobile] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023.98px)");
    const sync = () => {
      setMobile(mq.matches);
      setDrawerOpen(isMobileSidebarOpen());
    };
    sync();
    mq.addEventListener("change", sync);
    window.addEventListener("tt:sidebar", sync);
    return () => {
      mq.removeEventListener("change", sync);
      window.removeEventListener("tt:sidebar", sync);
    };
  }, []);

  if (!mobile || drawerOpen) return null;

  return (
    <button
      type="button"
      onClick={() => setMobileSidebarOpen(true)}
      aria-label="Open sidebar"
      className="sb-logo-btn inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-transparent text-muted transition-colors hover:bg-accent/10 hover:text-accent"
    >
      <Image
        src="/logo/taskhub-icon.svg"
        alt="TaskHub"
        width={634}
        height={550}
        unoptimized
        className="h-8 w-8 object-contain"
      />
    </button>
  );
}
