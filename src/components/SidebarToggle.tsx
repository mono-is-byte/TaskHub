"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Image from "next/image";
import { closeMobileSidebar, getCollapsed, isMobileSidebarOpen, isSidebarMobile, setCollapsed, setMobileSidebarOpen } from "@/lib/sidebar";

/* ============================================================
 * PC (DESKTOP) + MOBILE SHARED: Sidebar collapse / drawer toggle
 * This is the logo button that lives at the top of the sidebar.
 *   - PC (>=1024px): collapses/expands the sidebar rail (Full logo ↔ Icon logo)
 *   - Mobile (<1024px): opens/closes the drawer; acts as the close mark (Full logo) when open
 * Rendered in: src/app/(app)/layout.tsx
 * ============================================================ */
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
      if (!mq.matches) closeMobileSidebar();
      if (mq.matches && isMobileSidebarOpen()) {
        // Freeze body in place (no layout shift, no scrollbar compensation needed).
        const scrollY = window.scrollY;
        document.body.style.position = "fixed";
        document.body.style.top = "-" + scrollY + "px";
        document.body.style.left = "0";
        document.body.style.right = "0";
        document.body.style.overflow = "hidden";
      } else {
        // Restore scroll position.
        const scrollY = document.body.style.top;
        document.body.style.position = "";
        document.body.style.top = "";
        document.body.style.left = "";
        document.body.style.right = "";
        document.body.style.overflow = "";
        document.body.style.paddingRight = "";
        if (scrollY) {
          window.scrollTo(0, parseInt(scrollY, 10) * -1);
        }
      }
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
      const scrollY = document.body.style.top;
      document.body.style.position = "";
      document.body.style.top = "";
      document.body.style.left = "";
      document.body.style.right = "";
      document.body.style.overflow = "";
      document.body.style.paddingRight = "";
      if (scrollY) window.scrollTo(0, parseInt(scrollY, 10) * -1);
    };
  }, []);

  // Close the mobile drawer after navigation (any route change).
  useEffect(() => {
    closeMobileSidebar();
  }, [pathname]);

  // PC (desktop): Collapse sidebar / Expand sidebar
  // Mobile: Close sidebar / Open sidebar
  const label = mobile
    ? drawerOpen ? "Close sidebar" : "Open sidebar"
    : collapsed ? "Expand sidebar" : "Collapse sidebar";
  const ariaExpanded = mobile ? drawerOpen : !collapsed;

  function toggle() {
    if (isSidebarMobile()) setMobileSidebarOpen(!isMobileSidebarOpen());
    else setCollapsed(!getCollapsed());
  }

  // PC (desktop): expanded → taskhub-full.svg, collapsed → taskhub-icon.svg
  // Mobile: open → taskhub-full.svg (drawer close mark), closed → hidden (MobileTopBar handles open)
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

/* ============================================================
 * MOBILE ONLY: Page header icon button (drawer open trigger)
 * This is the small 32px icon that sits inline to the LEFT of the page <h1> title.
 *   - Mobile (<1024px): renders the icon button; clicking it opens the drawer
 *   - PC (>=1024px): returns null (not rendered, desktop has its own sidebar logo)
 *   - Hidden while the drawer is open (the drawer's Full logo takes over as close control)
 * Rendered in: each page under src/app/(app)/ (Dashboard, Calendar, Users, etc.)
 * ============================================================ */
export function MobileTopBar() {
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

  if (!mobile) return null;

  return (
    <button
      type="button"
      onClick={() => setMobileSidebarOpen(true)}
      aria-label="Open sidebar"
      aria-hidden={drawerOpen}
      tabIndex={drawerOpen ? -1 : 0}
      className={`sb-logo-btn inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-transparent text-muted transition-colors hover:bg-accent/10 hover:text-accent ${drawerOpen ? "invisible pointer-events-none" : ""}`}
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
