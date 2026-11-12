/**
 * Shared sidebar state (change request: collapsible sidebar).
 *
 * ONE source of truth for the desktop rail: the `data-sb` attribute on <html>,
 * persisted in localStorage ("tt.sidebar") and restored before paint by the root
 * layout's inline script (no flicker, no server round-trip, no schema change).
 *
 * The styling is plain CSS keyed off that attribute (see globals.css), so a
 * toggle never re-renders React trees, and only the toggle button itself keeps
 * local state for its icon/aria attributes.
 */

const SIDEBAR_LS_KEY = "tt.sidebar";

const EVENT = "tt:sidebar";

/**
 * Fixed-height workspace list: exactly this many rows are visible before the
 * list scrolls. More than this many → fixed-height scroll area; this many or
 * fewer → natural height (no scrollbar). Shared by the desktop sidebar and the
 * mobile Workspaces sheet.
 */
export const WORKSPACE_LIST_ROWS = 5;

/**
 * CSS `max-height` for a workspace list capped at {@link WORKSPACE_LIST_ROWS}
 * rows. `rowRem`/`gapRem` describe the row height and the gap between rows of
 * the calling list (desktop rows and mobile sheet rows differ in size).
 */
export function workspaceListMaxHeight(rowRem: number, gapRem: number): string {
  return `calc(${WORKSPACE_LIST_ROWS} * ${rowRem}rem + ${WORKSPACE_LIST_ROWS - 1} * ${gapRem}rem)`;
}

export function getCollapsed(): boolean {
  return typeof document !== "undefined" && document.documentElement.dataset.sb === "collapsed";
}

function emit() {
  window.dispatchEvent(new Event(EVENT));
}

/** Desktop rail: collapse/expand and remember the choice on this device. */
export function setCollapsed(collapsed: boolean) {
  const root = document.documentElement;
  root.dataset.sb = collapsed ? "collapsed" : "expanded";
  try {
    window.localStorage.setItem(SIDEBAR_LS_KEY, root.dataset.sb);
  } catch { /* storage unavailable — the choice just won't persist */ }
  emit();
}

/** Used by nested navigation actions that need full-width UI (e.g. New project). */
export function expandSidebar() {
  if (getCollapsed()) setCollapsed(false);
}
