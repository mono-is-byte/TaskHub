"use client";

import { useSyncExternalStore, type ReactNode } from "react";

/**
 * The ONE viewport switch for the app shell.
 *
 * Desktop and mobile layouts are completely separate trees: only one of them is
 * mounted at a time, selected here by a JS media-query subscription (never by
 * CSS). The breakpoint is the app's existing `lg` cutoff — the same one the old
 * sidebar drawer used.
 */
const MOBILE_QUERY = "(max-width: 1023.98px)";

function subscribe(callback: () => void) {
  const mq = window.matchMedia(MOBILE_QUERY);
  mq.addEventListener("change", callback);
  return () => mq.removeEventListener("change", callback);
}

function getSnapshot(): boolean {
  return window.matchMedia(MOBILE_QUERY).matches;
}

/**
 * The server cannot know the viewport, so the first render (and hydration)
 * assumes desktop — the default shell — and the client corrects immediately
 * after hydration. This keeps desktop server-rendered exactly as before.
 */
function getServerSnapshot(): boolean {
  return false;
}

/** True below the `lg` breakpoint. Shared by the switcher and page headers. */
export function useIsMobile(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Renders exactly one of the two shells. The other never mounts. */
export default function ViewportSwitch({
  desktop,
  mobile,
}: {
  desktop: ReactNode;
  mobile: ReactNode;
}) {
  return <>{useIsMobile() ? mobile : desktop}</>;
}
