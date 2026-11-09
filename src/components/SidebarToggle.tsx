"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Image from "next/image";
import { closeMobileSidebar, getCollapsed, isMobileSidebarOpen, isSidebarMobile, setCollapsed, setMobileSidebarOpen } from "@/lib/sidebar";

/**
 * The ONE sidebar open/close control: the brand logo itself.
 *
 * Lives at the sidebar's top edge (fixed, so it follows the rail width) and
 * drives both states:
 *  - ≥1024px: collapses the rail to icons-only / expands it again, remembered
 *    in localStorage (`tt.sidebar`, restored before paint — no flicker).
 *  - <1024px: acts as the drawer's close mark while the drawer is open; the
 *    drawer open trigger itself lives in the MobileTopBar (page header icon).
 *    The drawer also closes itself after any navigation (see the pathname effect).
 *
 * All visual state is CSS keyed off <html data-sb / data-sb-mobile>, so a click
 * never re-renders pages — only this button re-reads the state for its icon,
 * aria-expanded and label. The backdrop below only exists on mobile.
 */
export default function SidebarToggle() {
  const pathname = usePathname();
  const [mobile, setMobile] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [collapsed, setCollapsedState] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023.98px)");
    const sync = () => {
      setMobile(mq.matches);
      setCollapsedState(getCollapsed());
      setDrawerOpen(isMobileSidebarOpen());
      // Back at desktop width the drawer is meaningless — make sure it is closed.
      if (!mq.matches) closeMobileSidebar();
      // Lock body scroll while the mobile drawer is open.
      if (mq.matches && isMobileSidebarOpen()) {
        document.body.style.overflow = "hidden";
      } else {
        document.body.style.overflow = "";
      }
      // While the drawer is closed its off-canvas links must not be keyboard-reachable.
      const aside = document.getElementById("app-sidebar");
      if (aside) aside.inert = mq.matches && !isMobileSidebarOpen();
    };
    sync();
    mq.addEventListener("change", sync);
    window.addEventListener("tt:sidebar", sync);
    window.addEventListener("storage", sync);
    return () => {
      mq.removeEventListener("change", sync);
      window.removeEventListener("tt:sidebar", sync);
      window.removeEventListener("storage", sync);
      document.body.style.overflow = "";
    };
  }, []);

  // Close the mobile drawer after navigation (any route change).
  useEffect(() => {
    closeMobileSidebar();
  }, [pathname]);

  const label = mobile
    ? drawerOpen
      ? "Close sidebar"
      : "Open sidebar"
    : collapsed
      ? "Expand sidebar"
      : "Collapse sidebar";
  const ariaExpanded = mobile ? drawerOpen : !collapsed;

  function toggle() {
    if (isSidebarMobile()) setMobileSidebarOpen(!isMobileSidebarOpen());
    else setCollapsed(!getCollapsed());
  }

  // Mobile: open → taskhub-full.svg (drawer header / close mark); closed → the
  //   MobileTopBar icon is the open trigger and the fixed button hides itself.
  // Desktop: expanded → taskhub-full.svg, collapsed → taskhub-icon.svg.
  const logoSrc = !mobile ? (collapsed ? "/logo/taskhub-icon.svg" : "/logo/taskhub-full.svg") : "/logo/taskhub-full.svg";
  const iconLogo = logoSrc.endsWith("taskhub-icon.svg");

  return (
    <>
      <div className="sb-backdrop" aria-hidden="true" onClick={() => setMobileSidebarOpen(false)} />
      <button
        type="button"
        onClick={toggle}
        aria-expanded={ariaExpanded}
        aria-controls="app-sidebar"
        title={label}
        aria-label={label}
        className="sb-toggle"
      >
        <Image
          src={logoSrc}
          alt="TaskHub"
          width={iconLogo ? 634 : 844}
          height={iconLogo ? 550 : 369}
          unoptimized
          className={iconLogo ? "h-8 w-8 object-contain" : "h-9 w-auto"}
        />
      </button>
    </>
  );
}
