"use client";

import { useCallback, useEffect, useState } from "react";


/**
 * Audit Log — PHASE 6.
 *
 * The server caps the table at the newest 25 rows (`AUDIT_RETENTION`) and prunes
 * the rest inline, so this page is a plain "latest events" list: no pagination,
 * no "load more", no page 2. Rows are compact and the panel scrolls on its own,
 * so all 25 fit a normal window.
 *
 * Entity ids are resolved to readable labels server-side ("user: administrator"),
 * and `meta` shows as a one-line summary that expands to the full JSON on click.
 */

interface Log {
  id: string;
  action: string;
  entity: string | null;
  entityId: string | null;
  entityLabel: string | null;
  meta: string;
  ip: string | null;
  createdAt: string;
  actor: { name: string; email: string } | null;
}

const META_LIMIT = 40;

function short(value: unknown): string {
  if (value === null || value === undefined) return "—";
  const s = typeof value === "string" ? value : JSON.stringify(value);
  return s.length > META_LIMIT ? `${s.slice(0, META_LIMIT)}…` : s;
}

/** One-line, human-readable summary of a stored meta blob ("name: old → new"). */
function metaSummary(meta: string): string {
  try {
    const value = JSON.parse(meta) as Record<string, unknown>;
    const keys = Object.keys(value);
    if (keys.length === 0) return "no changes recorded";
    return keys
      .map((k) => {
        const v = value[k];
        if (Array.isArray(v) && v.length === 2) return `${k}: ${short(v[0])} → ${short(v[1])}`;
        if (v && typeof v === "object") return `${k}: {…}`;
        return `${k}: ${short(v)}`;
      })
      .join("  •  ");
  } catch {
    return short(meta);
  }
}

function getActionColor(action: string): string {
  if (action.startsWith("auth.")) return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300";
  if (action.startsWith("user.")) return "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300";
  if (action.includes("failed") || action.includes("error")) return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300";
  return "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300";
}

export default function AdminAuditPage() {
  const [logs, setLogs] = useState<Log[]>([]);
  const [actions, setActions] = useState<string[]>([]);
  const [limit, setLimit] = useState(25);
  const [filter, setFilter] = useState("");

  const load = useCallback(async (action: string) => {
    const res = await fetch(`/api/admin/audit${action ? `?action=${encodeURIComponent(action)}` : ""}`);
    if (!res.ok) {
      if (res.status === 403) window.location.href = "/no-access";
      return;
    }
    const j = await res.json();
    setLogs(j.data.logs);
    setActions(j.data.actions);
    if (typeof j.data.limit === "number") setLimit(j.data.limit);
  }, []);

  useEffect(() => { void load(""); }, [load]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span className="text-[12px] sm:text-[11px] text-muted">Showing the latest {limit} events</span>
      </div>
      <div className="mb-2 flex gap-2 text-sm">
        <select
          value={filter}
          onChange={(e) => { setFilter(e.target.value); void load(e.target.value); }}
          className="tt-input max-w-xs audit-action-filter"
          aria-label="Filter by action"
        >
          <option value="">All actions</option>
          {actions.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>
      {/* Mobile: card list (<640px). Desktop table below is unchanged. */}
      <div className="sm:hidden flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overflow-x-hidden pb-20">
        {logs.map((l) => {
          const d = new Date(l.createdAt);
          const nowYear = new Date().getFullYear();
          const timeShort = d.toLocaleString(undefined, {
            ...(d.getFullYear() !== nowYear ? { year: "numeric" as const } : {}),
            month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit",
          });
          const timeFull = d.toLocaleString(undefined, { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
          const entity = l.entityLabel ?? (l.entity ? `${l.entity} ${l.entityId?.slice(0, 8) ?? ""}` : "—");
          return (
            <article key={l.id} className="w-full rounded-lg border border-line bg-surface-strong px-4 py-3 shadow-sm" style={{ lineHeight: 1.35 }}>
              <div className="flex items-start justify-between gap-2">
                <span className={`min-w-0 rounded px-2 py-1 font-mono text-[11px] ${getActionColor(l.action)}`} style={{ overflowWrap: "anywhere" }}>{l.action}</span>
                <span className="shrink-0 text-[11px] text-muted" title={timeFull}>{timeShort}</span>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[12px] font-semibold">
                  {l.actor?.name?.charAt(0).toUpperCase() || "—"}
                </div>
                <div className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[13px] font-semibold" style={{ minWidth: 0, wordBreak: "normal" }} title={l.actor?.name ?? "—"}>{l.actor?.name ?? "—"}</div>
              </div>
              <div className="mt-3 flex items-center gap-3 border-t border-line pt-3">
                <div className="flex min-w-0 flex-1 items-center justify-between">
                  <div className="text-[10px] uppercase tracking-[0.04em] text-muted">Entity</div>
                  <div className="truncate text-[12px]" title={entity}>{entity}</div>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-3">
                <div className="flex min-w-0 flex-1 items-center justify-between">
                  <div className="text-[10px] uppercase tracking-[0.04em] text-muted">Change</div>
                  <div className="truncate text-[12px]">
                    <details className="min-w-0">
                      <summary className="cursor-pointer truncate" title={l.meta} style={{ minHeight: 32, display: "flex", alignItems: "center" }}>
                        <span className="inline-flex items-center rounded bg-muted px-2 py-1 text-xs">{metaSummary(l.meta)}</span>
                      </summary>
                      <pre className="mt-2 max-h-40 overflow-auto rounded bg-muted p-2 font-mono text-[11px]" style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", overflowX: "auto" }}>{l.meta}</pre>
                    </details>
                  </div>
                </div>
              </div>
            </article>
          );
        })}
        {logs.length === 0 && (
          <div className="rounded-lg border border-line bg-surface-strong p-6 text-center text-[12px] text-muted">No audit events yet.</div>
        )}
      </div>
      {/* One scroll container: sticky head, compact rows, no empty tail. */}
      <div className="hidden sm:block scroll-thin min-h-0 flex-1 overflow-y-auto overflow-x-hidden rounded-lg border border-line bg-surface-strong">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-surface-strong text-left">
            <tr>
              <th className="p-2 font-semibold">Time</th>
              <th className="p-2 font-semibold">Actor</th>
              <th className="p-2 font-semibold">Action</th>
              <th className="p-2 font-semibold">Entity</th>
              <th className="p-2 font-semibold">Change</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id} className="border-t border-line align-top hover:bg-line/40">
                <td className="whitespace-nowrap p-2 tabular-nums">
                  {new Date(l.createdAt).toLocaleString(undefined, {
                    year: "numeric", month: "short", day: "2-digit",
                    hour: "2-digit", minute: "2-digit",
                  })}
                </td>
                <td className="break-all p-2">{l.actor ? l.actor.name : "—"}</td>
                <td className="break-all p-2 font-mono">{l.action}</td>
                <td className="p-2">
                  {l.entityLabel ?? (l.entity ? `${l.entity} ${l.entityId?.slice(0, 8) ?? ""}` : "—")}
                </td>
                <td className="max-w-md p-2 text-muted">
                  <details>
                    <summary className="cursor-pointer truncate" title={l.meta}>{metaSummary(l.meta)}</summary>
                    <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-all font-mono text-[10px]">{l.meta}</pre>
                  </details>
                </td>
              </tr>
            ))}
            {logs.length === 0 && (
              <tr><td colSpan={5} className="p-6 text-center text-muted">No audit events yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}