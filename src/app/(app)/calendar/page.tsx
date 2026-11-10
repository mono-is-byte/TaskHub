"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { buildCalendarPdf } from "@/lib/pdf";
import { dayKey, monthGrid, weekGrid, occursOn, type CalendarData, type CalendarTask } from "@/lib/calendar";
import { classifyDay, holidayDayKeys, type ExceptionRow, type HolidaySpan } from "@/lib/holidayDates";
import { TIMER_HEX, TIMER_LABEL } from "@/lib/timerFormat";
import CalendarSettings from "@/components/CalendarSettings";
import { MobileTopBar } from "@/components/SidebarToggle";
import {
  IconChevronLeft, IconChevronRight, IconDownload, IconFlag, IconSliders, IconSun, IconX,
} from "@/components/icons";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const DAY_CLASS: Record<string, string> = {
  working: "bg-surface",
  weekly_holiday: "bg-hol-weekly",
  holiday: "bg-hol-holiday",
  exception: "bg-hol-exception",
};

function cx(...a: (string | false | null | undefined)[]) { return a.filter(Boolean).join(" "); }

function useDropdown() {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });
  useEffect(() => {
    if (!open) return;
    const update = () => {
      const r = btnRef.current?.getBoundingClientRect();
      if (r) setPos({ top: r.bottom + 4, left: r.left, width: r.width });
    };
    update();
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open]);
  return { open, setOpen, btnRef, panelRef, pos };
}

function Panel({ open, pos, panelRef, children, className = "" }: { open: boolean; pos: { top: number; left: number; width: number }; panelRef: React.RefObject<HTMLDivElement | null>; children: React.ReactNode; className?: string }) {
  if (!open) return null;
  const style: React.CSSProperties = { position: "fixed", top: Math.min(pos.top, (typeof window !== "undefined" ? window.innerHeight : 800) - 16), left: Math.max(8, Math.min(pos.left, (typeof window !== "undefined" ? window.innerWidth : 1200) - 320)), zIndex: 60 };
  return createPortal(
    <div ref={panelRef} style={style} className={cx("glass-strong max-h-80 w-72 overflow-auto rounded-md border border-line p-2 text-xs shadow-lg", className)}>
      {children}
    </div>,
    document.body,
  );
}

function RowBtn({ checked, label, onClick, indent = false, bold = false }: { checked: boolean; label: string; onClick: () => void; indent?: boolean; bold?: boolean }) {
  return (
    <button type="button" onClick={onClick} className={cx("flex w-full items-center gap-2 rounded px-2 py-1 text-left hover:bg-line", indent && "pl-5", bold && "font-medium")}>
      <input type="checkbox" readOnly checked={checked} className="h-3.5 w-3.5 accent-indigo-600" />
      <span className="min-w-0 flex-1 truncate" title={label}>{label}</span>
    </button>
  );
}

function uniq<T>(arr: T[]) { return [...new Set(arr)]; }

export default function CalendarPage() {
  const router = useRouter();
  const [view, setView] = useState<"month" | "week">("month");
  const [anchor, setAnchor] = useState(() => new Date());

  // Multi-select filters
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[] | null>(null); // null = not initialized (use default ongoing)
  const [selectedUserIds, setSelectedUserIds] = useState<string[] | null>(null); // null = not initialized (default all users)
  const [includeUnassigned, setIncludeUnassigned] = useState(true);

  const [data, setData] = useState<CalendarData | null>(null);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [pdfBusy, setPdfBusy] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [busyDay, setBusyDay] = useState("");

  const cells = useMemo(() => (view === "month" ? monthGrid(anchor) : weekGrid(anchor)), [view, anchor]);
  const fromKey = dayKey(cells[0]);
  const toKey = dayKey(cells[cells.length - 1]);
  const todayKey = dayKey(new Date());

  const projects = data?.projects ?? [];
  const ongoing = useMemo(() => projects.filter((p: any) => !p.isCompleted), [projects]);
  const completed = useMemo(() => projects.filter((p: any) => p.isCompleted), [projects]);
  const ongoingIds = useMemo(() => ongoing.map((p: any) => p.id), [ongoing]);

  // Initialize defaults once we know available projects/users
  useEffect(() => {
    if (!data) return;
    if (selectedProjectIds === null) {
      setSelectedProjectIds(ongoingIds); // default: ongoing workspaces selected
    }
    if (selectedUserIds === null) {
      setSelectedUserIds((data.members ?? []).map((m) => m.userId)); // default: all users selected
      setIncludeUnassigned(true);
    }
  }, [data, ongoingIds, selectedProjectIds, selectedUserIds]);

  const effectiveProjectIds = selectedProjectIds ?? ongoingIds; // before init, behave as default ongoing
  const allMemberIds = (data?.members ?? []).map((m) => m.userId);
  const effectiveUserIds = selectedUserIds ?? allMemberIds;
  const effectiveUnassigned = selectedUserIds === null ? true : includeUnassigned;

  const wsAllSelected = projects.length > 0 && projects.every((p: any) => effectiveProjectIds.includes(p.id));
  const wsAllOngoing = ongoing.length > 0 && ongoing.every((p: any) => effectiveProjectIds.includes(p.id)) && completed.every((p: any) => !effectiveProjectIds.includes(p.id));
  const wsAllCompleted = completed.length > 0 && completed.every((p: any) => effectiveProjectIds.includes(p.id)) && ongoing.every((p: any) => !effectiveProjectIds.includes(p.id));

  const usersAllSelected = allMemberIds.length > 0 && allMemberIds.every((id) => effectiveUserIds.includes(id)) && effectiveUnassigned;

  useEffect(() => {
    const params = new URLSearchParams({ from: fromKey, to: toKey });
    // workspaces
    if (selectedProjectIds !== null) {
      if (selectedProjectIds.length === 0) {
        params.append("projectId", "__none__");
      } else if (wsAllSelected) {
        params.append("projectId", "__all__");
      } else {
        selectedProjectIds.forEach((id) => params.append("projectId", id));
      }
    } // null => let server default to ongoing
    // users
    if (selectedUserIds !== null) {
      const all = usersAllSelected;
      if (all) {
        // default all users => no filter
      } else {
        if (effectiveUserIds.length === 0 && !effectiveUnassigned) {
          params.append("assigneeId", "__none_user__");
        } else {
          effectiveUserIds.forEach((id) => params.append("assigneeId", id));
          if (effectiveUnassigned) params.append("assigneeId", "none");
        }
      }
    }
    api<CalendarData>(`/api/calendar?${params.toString()}`)
      .then((d) => { setData(d); setError(""); })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load calendar."));
  }, [fromKey, toKey, selectedProjectIds, selectedUserIds, includeUnassigned, reloadKey, wsAllSelected, usersAllSelected, effectiveUserIds, effectiveUnassigned]);

  const spans = useMemo<HolidaySpan[]>(
    () => (data?.holidays ?? []).map((h) => ({
      id: h.id, startDate: h.date, endDate: h.endDate,
      name: h.name, description: h.description, type: h.type,
    })),
    [data],
  );

  const holidayByDay = useMemo(() => {
    const map = new Map<string, HolidaySpan[]>();
    for (const span of spans) {
      for (const key of holidayDayKeys(span)) {
        const list = map.get(key) ?? [];
        list.push(span);
        map.set(key, list);
      }
    }
    return map;
  }, [spans]);

  const exceptionByDay = useMemo(() => {
    const map: Record<string, ExceptionRow> = {};
    for (const e of data?.exceptions ?? []) map[e.date] = e;
    return map;
  }, [data]);

  const title = view === "month"
    ? anchor.toLocaleDateString(undefined, { month: "long", year: "numeric" })
    : `${cells[0].toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${cells[6].toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;

  function step(dir: number) {
    setAnchor((a) => view === "month"
      ? new Date(a.getFullYear(), a.getMonth() + dir, 1)
      : new Date(a.getFullYear(), a.getMonth(), a.getDate() + dir * 7));
  }

  async function toggleException(day: string, has: boolean) {
    if (busyDay) return;
    setBusyDay(day);
    setError("");
    setMsg("");
    try {
      if (has) {
        await api(`/api/working-days?date=${day}`, { method: "DELETE" });
        setMsg(`${day}: working-day exception removed — the holiday status is back.`);
      } else {
        await api("/api/working-days", { method: "POST", body: JSON.stringify({ date: day }) });
        setMsg(`${day}: office open — this date now counts as a working day.`);
      }
      setReloadKey((k) => k + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update the working day.");
    } finally {
      setBusyDay("");
    }
  }

  async function downloadPdf() {
    if (!data || pdfBusy) return;
    setPdfBusy(true);
    try {
      const wsLabel = wsAllSelected ? "All Workspaces" : wsAllOngoing ? "Ongoing Workspaces" : wsAllCompleted ? "Completed Workspaces" : `${effectiveProjectIds.length} workspaces`;
      const userLabel = usersAllSelected ? "All users" : `${effectiveUserIds.length + (effectiveUnassigned ? 1 : 0)} selected`;
      const pdfHolidays: { date: string; name: string }[] = [];
      for (const [date, list] of holidayByDay) {
        for (const h of list) pdfHolidays.push({ date, name: h.name || "Holiday" });
      }
      for (const e of data.exceptions) pdfHolidays.push({ date: e.date, name: e.note || "Office open" });
      const doc = await buildCalendarPdf({
        title,
        subtitle: `${wsLabel} · ${userLabel}`,
        generatedAt: new Date(),
        cells: cells.map((d) => ({ dayKey: dayKey(d), inMonth: d.getMonth() === anchor.getMonth() })),
        holidays: pdfHolidays,
        tasks: data.tasks.map((t) => ({ key: t.key, title: t.title, startDate: t.startDate, endDate: t.endDate, statusColor: t.statusColor })),
      });
      doc.save(`calendar-${fromKey}${toKey !== fromKey ? `_${toKey}` : ""}.pdf`);
    } finally {
      setPdfBusy(false);
    }
  }

  // Dropdown helpers
  const wsDrop = useDropdown();
  const userDrop = useDropdown();
  const btnBase = "tt-btn max-w-[14rem] truncate";
  const actionBtn = "rounded px-2 py-0.5 text-[11px] text-muted hover:bg-line hover:text-ink";

  const wsLabel = wsAllSelected ? "All Workspaces" : wsAllOngoing ? "Ongoing Workspaces" : wsAllCompleted ? "Completed Workspaces" : effectiveProjectIds.length === 1 ? (projects.find((p: any) => p.id === effectiveProjectIds[0]) ? `${projects.find((p: any)=>p.id===effectiveProjectIds[0])!.key} · ${projects.find((p: any)=>p.id===effectiveProjectIds[0])!.name}` : "1 workspace") : `${effectiveProjectIds.length} workspaces`;
  const userLabel = usersAllSelected ? "All users" : `${effectiveUserIds.length + (effectiveUnassigned ? 1 : 0)} selected`;

  const setWs = (ids: string[]) => setSelectedProjectIds(ids);
  const toggleWs = (id: string) => {
    const cur = new Set(effectiveProjectIds);
    if (cur.has(id)) cur.delete(id); else cur.add(id);
    setSelectedProjectIds([...cur]);
  };
  const selectAllWs = () => setSelectedProjectIds(projects.map((p: any) => p.id));
  const selectOngoing = () => setSelectedProjectIds(ongoingIds);
  const selectCompleted = () => setSelectedProjectIds(completed.map((p: any) => p.id));
  const clearWs = () => setSelectedProjectIds([]);

  const toggleUser = (id: string) => {
    if (usersAllSelected) {
      // switch from All users to only this user
      setSelectedUserIds([id]);
      setIncludeUnassigned(false);
      return;
    }
    const cur = new Set(effectiveUserIds);
    if (cur.has(id)) cur.delete(id); else cur.add(id);
    setSelectedUserIds([...cur]);
  };
  const toggleUnassigned = () => {
    if (usersAllSelected) {
      // switch from All users to only Unassigned
      setSelectedUserIds([]);
      setIncludeUnassigned(true);
      return;
    }
    setIncludeUnassigned((v) => !v);
  };
  const selectAllUsers = () => { setSelectedUserIds(allMemberIds); setIncludeUnassigned(true); };
  const clearUsers = () => { setSelectedUserIds([]); setIncludeUnassigned(false); };

  const chip = (t: CalendarTask) => (
    <button
      key={t.id}
      onClick={() => router.push(`/p/${t.projectId}/board?task=${t.id}`)}
      title={`${t.key} ${t.title}\n${t.startDate ?? "…"} → ${t.endDate ?? "…"} · ${t.statusName}${t.assigneeName ? ` · ${t.assigneeName}` : ""}${t.assignedByName ? ` (assigned by ${t.assignedByName})` : ""}\nTimer: ${TIMER_LABEL[t.timerState] ?? t.timerState}`}
      className="block w-full truncate rounded-r border-l-4 bg-surface px-1 text-left text-[10px] leading-4 shadow-sm hover:bg-line"
      style={{ borderLeftColor: TIMER_HEX[t.timerState] ?? t.statusColor }}
    >
      <span className="mr-0.5 inline-block h-1.5 w-1.5 rounded-full align-middle" style={{ background: t.statusColor }} />
      <span className="font-mono text-slate-500">{t.key}</span> {t.title}
    </button>
  );

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
        <div className="flex items-center gap-2.5">
          <MobileTopBar />
          <h1 className="tt-title">Calendar</h1>
        </div>
        <button onClick={() => step(-1)} className="rounded border px-2 py-1 dark:border-slate-700" aria-label={view === "month" ? "Previous month" : "Previous week"} title={view === "month" ? "Previous month" : "Previous week"}><IconChevronLeft className="h-3.5 w-3.5" /></button>
        <button onClick={() => setAnchor(new Date())} className="rounded border px-2 py-1 dark:border-slate-700">Today</button>
        <button onClick={() => step(1)} className="rounded border px-2 py-1 dark:border-slate-700" aria-label={view === "month" ? "Next month" : "Next week"} title={view === "month" ? "Next month" : "Next week"}><IconChevronRight className="h-3.5 w-3.5" /></button>
        <span className="font-semibold">{title}</span>
        <select value={view} onChange={(e) => setView(e.target.value as "month" | "week")} className="rounded border p-1 dark:border-slate-700 dark:bg-slate-800" aria-label="Calendar view" title="Month or week view">
          <option value="month">Month</option>
          <option value="week">Week</option>
        </select>

        {/* Workspace multi-select */}
        <div>
          <button ref={wsDrop.btnRef} type="button" className={btnBase} onClick={() => wsDrop.setOpen((v) => !v)} title="Workspaces">
            <span className="truncate">{wsLabel}</span>
            <IconChevronRight className={cx("h-3.5 w-3.5 transition-transform", wsDrop.open && "rotate-90")} />
          </button>
          <Panel open={wsDrop.open} pos={wsDrop.pos} panelRef={wsDrop.panelRef}>
            <div className="mb-1 flex items-center justify-between px-1">
              <span className="font-semibold">Workspaces</span>
              <div className="flex items-center gap-1 rounded-md border border-line bg-surface p-0.5">
                <button type="button" className={actionBtn} onClick={selectAllWs}>Select All</button>
                <button type="button" className={actionBtn} onClick={clearWs}>Clear</button>
              </div>
            </div>
            <RowBtn checked={wsAllSelected && effectiveProjectIds.length > 0} label="All Workspaces" onClick={selectAllWs} bold />
            <RowBtn checked={wsAllOngoing && effectiveProjectIds.length > 0} label="Ongoing Workspaces" onClick={selectOngoing} bold />
            <RowBtn checked={wsAllCompleted && effectiveProjectIds.length > 0} label="Completed Workspaces" onClick={selectCompleted} bold />
            <div className="my-1 border-t border-line" />
            {ongoing.length > 0 && <div className="px-2 py-1 text-[10px] font-semibold uppercase text-muted">Ongoing</div>}
            {ongoing.map((p: any) => (
              <RowBtn key={p.id} checked={effectiveProjectIds.includes(p.id)} label={`${p.key} · ${p.name}`} onClick={() => toggleWs(p.id)} indent />
            ))}
            {completed.length > 0 && <div className="mt-1 px-2 py-1 text-[10px] font-semibold uppercase text-muted">Completed</div>}
            {completed.map((p: any) => (
              <RowBtn key={p.id} checked={effectiveProjectIds.includes(p.id)} label={`${p.key} · ${p.name}`} onClick={() => toggleWs(p.id)} indent />
            ))}
            {projects.length === 0 && <p className="px-2 py-1 text-muted">No workspaces.</p>}
          </Panel>
        </div>

        {/* User multi-select */}
        <div>
          <button ref={userDrop.btnRef} type="button" className={btnBase} onClick={() => userDrop.setOpen((v) => !v)} title="Users">
            <span className="truncate">{userLabel}</span>
            <IconChevronRight className={cx("h-3.5 w-3.5 transition-transform", userDrop.open && "rotate-90")} />
          </button>
          <Panel open={userDrop.open} pos={userDrop.pos} panelRef={userDrop.panelRef}>
            <div className="mb-1 flex items-center justify-between px-1">
              <span className="font-semibold">Users</span>
              <div className="flex items-center gap-1 rounded-md border border-line bg-surface p-0.5">
                <button type="button" className={actionBtn} onClick={selectAllUsers}>Select All</button>
                <button type="button" className={actionBtn} onClick={clearUsers}>Clear</button>
              </div>
            </div>
            <RowBtn checked={usersAllSelected} label="All users" onClick={selectAllUsers} bold />
            <div className="my-1 border-t border-line" />
            <RowBtn checked={usersAllSelected || effectiveUnassigned} label="Unassigned" onClick={toggleUnassigned} />
            {(data?.members ?? []).map((m) => (
              <RowBtn key={m.userId} checked={usersAllSelected || effectiveUserIds.includes(m.userId)} label={m.name} onClick={() => toggleUser(m.userId)} />
            ))}
            {(data?.members ?? []).length === 0 && <p className="px-2 py-1 text-muted">No users available.</p>}
          </Panel>
        </div>

        {error && (
          <span className="flex items-center gap-1 rounded bg-red-50 px-2 py-0.5 text-red-700 dark:bg-red-950 dark:text-red-300" role="alert">
            {error}
            <button onClick={() => setReloadKey((k) => k + 1)} className="underline underline-offset-2" title="Try loading the calendar again">
              Retry
            </button>
          </span>
        )}
        {msg && <span className="rounded bg-emerald-50 px-2 py-0.5 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" role="status">{msg}</span>}
        <button onClick={() => setSettingsOpen(true)} className="tt-btn" title="Holidays and working-day exceptions are managed here">
          <IconSliders className="h-3.5 w-3.5" /> Calendar Settings
        </button>
        <button onClick={downloadPdf} disabled={pdfBusy || !data} className="tt-btn" title="Download this view as PDF">
          <IconDownload className="h-3.5 w-3.5" /> Download PDF{pdfBusy ? "…" : ""}
        </button>
      </div>

      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded-sm border border-line bg-hol-weekly" /> Weekly holiday (Fri/Sat)
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded-sm border border-line bg-hol-holiday" /> Holiday
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded-sm border border-line bg-hol-exception" /> Working-day exception (office open)
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded-sm border-2 border-accent" /> Today
        </span>
        <span className="ml-auto">Tasks show from start → due; border colour = timer state.</span>
      </div>

      {!data && !error && <p className="text-sm">Loading calendar…</p>}

      {data && (
        <div className="grid grid-cols-7 gap-px overflow-hidden rounded border border-line bg-line">
          {DAY_NAMES.map((d, i) => (
            <div
              key={d}
              className={`px-1 py-0.5 text-center text-[11px] font-bold uppercase ${
                i === 5 || i === 6 ? "bg-hol-weekly text-muted" : "bg-canvas text-muted"
              }`}
              title={i === 5 || i === 6 ? "Weekly holiday (Friday/Saturday)" : undefined}
            >
              {d}
            </div>
          ))}
          {cells.map((d) => {
            const key = dayKey(d);
            const inMonth = d.getMonth() === anchor.getMonth();
            const info = classifyDay(key, d, spans, exceptionByDay);
            const holidays = holidayByDay.get(key) ?? [];
            const tasks = data.tasks.filter((t) => occursOn(t.startDate, t.endDate, key));
            const canToggle = data.canManageGlobal;
            return (
              <div
                key={key}
                className={`group relative ${view === "week" ? "min-h-[320px]" : "min-h-[104px]"} p-1 ${DAY_CLASS[info.kind]} ${
                  info.kind === "holiday" || info.kind === "exception" ? "ring-1 ring-inset ring-red-200/70 dark:ring-red-900/50" : ""
                } ${inMonth ? "" : "opacity-60"} ${key === todayKey ? "ring-2 ring-inset ring-accent" : ""}`}
              >
                <div className="mb-1 flex items-center justify-between gap-1">
                  <span className={`text-[11px] font-semibold ${info.kind === "working" ? "text-slate-500" : "text-muted"}`}>{d.getDate()}</span>
                  {canToggle && (info.kind === "exception" ? (
                    <button
                      onClick={() => toggleException(key, true)}
                      disabled={busyDay === key}
                      className="rounded p-0.5 text-amber-700 opacity-70 hover:bg-amber-200 hover:opacity-100 disabled:opacity-40 dark:text-amber-200 dark:hover:bg-amber-900/60"
                      title="Remove the working-day exception and restore the holiday status"
                      aria-label={`Restore the holiday status of ${key}`}
                    >
                      <IconX className="h-3 w-3" />
                    </button>
                  ) : info.kind !== "working" ? (
                    <button
                      onClick={() => toggleException(key, false)}
                      disabled={busyDay === key}
                      className="rounded p-0.5 text-muted opacity-60 hover:bg-amber-100 hover:text-amber-800 hover:opacity-100 disabled:opacity-40 dark:hover:bg-amber-900/50 dark:hover:text-amber-200"
                      title="Mark as a working day (office open)"
                      aria-label={`Mark ${key} as a working day (office open)`}
                    >
                      <IconSun className="h-3 w-3" />
                    </button>
                  ) : null)}
                </div>
                {info.exception && (
                  <div
                    title={info.exception.note ? `Working day: ${info.exception.note}` : "Working-day exception: the office is open"}
                    className="mb-1 flex items-center gap-0.5 truncate rounded bg-amber-100 px-1 text-[10px] text-amber-800 dark:bg-amber-900/60 dark:text-amber-200"
                  >
                    <IconSun className="h-3 w-3 shrink-0" /> Office open
                  </div>
                )}
                {holidays.map((h) => (
                  <div
                    key={h.id}
                    title={`Holiday (all projects)${h.description ? `: ${h.description}` : ""}`}
                    className="mb-1 flex items-center gap-0.5 truncate rounded bg-red-100 px-1 text-[10px] text-red-700 dark:bg-red-900/60 dark:text-red-200"
                  >
                    <IconFlag className="h-3 w-3 shrink-0" /> {h.name || "Holiday"}
                  </div>
                ))}
                <div className="flex flex-col gap-0.5">{tasks.map(chip)}</div>
              </div>
            );
          })}
        </div>
      )}

      {settingsOpen && data && (
        <CalendarSettings
          onClose={() => setSettingsOpen(false)}
          onChanged={() => setReloadKey((k) => k + 1)}
        />
      )}
    </div>
  );
}