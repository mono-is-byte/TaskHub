"use client";

import { useMemo, useRef, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { IconChevronRight } from "@/components/icons";

type WsOpt = { id: string; key: string; name: string; isCompleted: boolean };
type UserOpt = { id: string; name: string };

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

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

export default function DashboardFilterBar({
  workspaces,
  availableYears,
  users,
  canFilterUsers,
  isRegularUser,
  viewerId,
}: {
  workspaces: WsOpt[];
  availableYears: number[];
  users: UserOpt[];
  canFilterUsers: boolean;
  isRegularUser: boolean;
  viewerId: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const now = new Date();
  const curMonth = now.getMonth() + 1;
  const curYear = now.getFullYear();

  // ----- Workspace state (source of truth = selected ids) -----
  const wsParams = sp.getAll("ws");
  const wsExplicitNone = wsParams.includes("none");
  const wsIsDefault = wsParams.length === 0; // absent => default (ongoing workspaces)
  const selectedWsIds = useMemo(() => {
    if (wsExplicitNone) return [] as string[];
    if (wsIsDefault) return workspaces.filter((w) => !w.isCompleted).map((w) => w.id);
    // filter legacy mode tokens out, keep ids
    return uniq(wsParams.filter((t) => t !== "all" && t !== "ongoing" && t !== "completed" && t !== "none"));
  }, [wsParams, wsExplicitNone, wsIsDefault, workspaces]);
  const selectedWsSet = useMemo(() => new Set(selectedWsIds), [selectedWsIds]);

  const ongoing = useMemo(() => workspaces.filter((w) => !w.isCompleted), [workspaces]);
  const completed = useMemo(() => workspaces.filter((w) => w.isCompleted), [workspaces]);
  const ongoingIds = useMemo(() => ongoing.map((w) => w.id), [ongoing]);
  const completedIds = useMemo(() => completed.map((w) => w.id), [completed]);

  const allSelected = workspaces.length > 0 && workspaces.every((w) => selectedWsSet.has(w.id));
  const allOngoingSelected = ongoing.length > 0 && ongoing.every((w) => selectedWsSet.has(w.id));
  const allCompletedSelected = completed.length > 0 && completed.every((w) => selectedWsSet.has(w.id));
  const noneOngoingSelected = ongoing.every((w) => !selectedWsSet.has(w.id));
  const noneCompletedSelected = completed.every((w) => !selectedWsSet.has(w.id));

  const wsLabel = useMemo(() => {
    if (wsExplicitNone || selectedWsIds.length === 0) return "No workspaces selected";
    if (allSelected) return "All Workspaces";
    if (allOngoingSelected && noneCompletedSelected) return "Ongoing Workspaces";
    if (allCompletedSelected && noneOngoingSelected) return "Completed Workspaces";
    if (selectedWsIds.length === 1) {
      const w = workspaces.find((x) => x.id === selectedWsIds[0]);
      return w ? `${w.key} · ${w.name}` : "1 workspace";
    }
    return `${selectedWsIds.length} workspaces`;
  }, [wsExplicitNone, selectedWsIds, allSelected, allOngoingSelected, allCompletedSelected, noneCompletedSelected, noneOngoingSelected, workspaces]);

  // ----- Month/Year state (separate) -----
  const monthParams = sp.getAll("month");
  const yearParams = sp.getAll("year");
  const periodParams = sp.getAll("period"); // legacy compat for initial render
  const monthAll = monthParams.includes("all");
  const yearAll = yearParams.includes("all");
  const monthIsNone = monthParams.includes("none");
  const yearIsNone = yearParams.includes("none");

  const selectedMonths = useMemo(() => {
    if (monthIsNone) return [] as number[];
    if (monthAll) return [1,2,3,4,5,6,7,8,9,10,11,12];
    if (monthParams.length > 0) {
      const ms = uniq(monthParams.map(Number).filter((n) => n >= 1 && n <= 12));
      return ms;
    }
    if (yearParams.length === 0 && periodParams.length > 0) {
      if (periodParams.includes("all")) return [1,2,3,4,5,6,7,8,9,10,11,12];
      const ms = uniq(periodParams.filter((p) => /^\d{4}-\d{2}$/.test(p)).map((p) => Number(p.slice(5, 7))).filter((n) => n >= 1 && n <= 12));
      return ms.length ? ms : [curMonth];
    }
    return [curMonth]; // default
  }, [monthIsNone, monthParams, monthAll, yearParams.length, periodParams, curMonth]);

  const selectedYears = useMemo(() => {
    if (yearIsNone) return [] as number[];
    if (yearAll) return [...availableYears];
    if (yearParams.length > 0) {
      const ys = uniq(yearParams.map(Number).filter((n) => Number.isInteger(n)));
      return ys;
    }
    if (monthParams.length === 0 && periodParams.length > 0) {
      if (periodParams.includes("all")) return [...availableYears];
      const ys = uniq(periodParams.filter((p) => /^\d{4}-\d{2}$/.test(p)).map((p) => Number(p.slice(0, 4))));
      return ys.length ? ys : [curYear];
    }
    return [curYear];
  }, [yearIsNone, yearParams, yearAll, monthParams.length, periodParams, availableYears, curYear]);

  const monthSet = useMemo(() => new Set(selectedMonths), [selectedMonths]);
  const yearSet = useMemo(() => new Set(selectedYears), [selectedYears]);

  const navigate = (mutate: (p: URLSearchParams) => void) => {
    const next = new URLSearchParams(sp.toString());
    mutate(next);
    const qs = next.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };

  const setWorkspaceIds = (ids: string[] | "none") => {
    navigate((p) => {
      p.delete("ws");
      if (ids === "none") {
        p.append("ws", "none");
      } else {
        ids.forEach((id) => p.append("ws", id));
      }
    });
  };

  const toggleWorkspace = (id: string) => {
    const next = new Set(selectedWsIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    const arr = [...next];
    setWorkspaceIds(arr);
  };

  const selectAllWorkspaces = () => setWorkspaceIds(workspaces.map((w) => w.id)); // quick action: select every available
  const selectOngoing = () => setWorkspaceIds(ongoingIds);
  const selectCompleted = () => setWorkspaceIds(completedIds);
  const clearWorkspaces = () => setWorkspaceIds("none");

  const setMonths = (vals: number[] | "all" | "none") => {
    navigate((p) => {
      p.delete("month");
      p.delete("period"); // drop legacy
      if (vals === "all") p.append("month", "all");
      else if (vals === "none") p.append("month", "none");
      else vals.forEach((m) => p.append("month", String(m)));
    });
  };
  const setYears = (vals: number[] | "all" | "none") => {
    navigate((p) => {
      p.delete("year");
      p.delete("period");
      if (vals === "all") p.append("year", "all");
      else if (vals === "none") p.append("year", "none");
      else vals.forEach((y) => p.append("year", String(y)));
    });
  };

  const toggleMonth = (m: number) => {
    const allMonths = [1,2,3,4,5,6,7,8,9,10,11,12];
    const cur = monthAll ? new Set(allMonths) : new Set(selectedMonths);
    if (cur.has(m)) cur.delete(m); else cur.add(m);
    const arr = [...cur].sort((a,b)=>a-b);
    if (arr.length === 0) setMonths("none");
    else if (arr.length === 12) setMonths("all");
    else setMonths(arr);
  };
  const toggleYear = (y: number) => {
    const cur = yearAll ? new Set(availableYears) : new Set(selectedYears);
    if (cur.has(y)) cur.delete(y); else cur.add(y);
    const arr = [...cur].sort((a,b)=>a-b);
    if (arr.length === 0) setYears("none");
    else if (availableYears.length > 0 && arr.length === availableYears.length) setYears("all");
    else setYears(arr);
  };

  // Users
  const userSel = sp.getAll("user");
  const usersExplicitNone = userSel.includes("__none");
  const usersAllMode = userSel.length === 0; // default: all users selected
  const setUsers = (ids: string[], unassigned: boolean, explicitNone = false) => {
    navigate((p) => {
      p.delete("user");
      if (explicitNone) {
        p.append("user", "__none");
        return;
      }
      ids.forEach((id) => p.append("user", id));
      if (unassigned) p.append("user", "unassigned");
    });
  };
  const selectAllUsers = () => setUsers([], false); // clear params => all users
  const clearUsers = () => setUsers([], false, true); // explicit clear
  const toggleUser = (id: string) => {
    if (usersAllMode) {
      setUsers([id], false); // switch from All users to only this user
      return;
    }
    if (usersExplicitNone) {
      setUsers([id], false);
      return;
    }
    const ids = userSel.filter((u) => u !== "unassigned" && u !== "__none");
    const un = userSel.includes("unassigned");
    const set = new Set(ids);
    if (set.has(id)) set.delete(id); else set.add(id);
    setUsers([...set], un);
  };
  const toggleUnassigned = () => {
    if (usersAllMode) {
      setUsers([], true); // switch from All users to only Unassigned
      return;
    }
    if (usersExplicitNone) {
      setUsers([], true);
      return;
    }
    const ids = userSel.filter((u) => u !== "unassigned" && u !== "__none");
    const un = userSel.includes("unassigned");
    setUsers(ids, !un);
  };

  const wsDrop = useDropdown();
  const periodDrop = useDropdown();
  const userDrop = useDropdown();

  const periodLabel = useMemo(() => {
    const mLabel = monthIsNone ? "No months" : (monthAll || selectedMonths.length === 12) ? "All months" : selectedMonths.length === 1 ? (MONTHS[selectedMonths[0] - 1] ?? "Month") : selectedMonths.length === 0 ? "No months" : `${selectedMonths.length} months`;
    const yLabel = yearIsNone ? "No years" : (yearAll || (availableYears.length > 0 && selectedYears.length === availableYears.length)) ? "All years" : selectedYears.length === 1 ? String(selectedYears[0]) : selectedYears.length === 0 ? "No years" : `${selectedYears.length} years`;
    if ((monthAll || selectedMonths.length === 12) && (yearAll || (availableYears.length > 0 && selectedYears.length === availableYears.length))) return "All periods";
    if (monthIsNone && yearIsNone) return "No period selected";
    return `${mLabel} · ${yLabel}`;
  }, [monthIsNone, yearIsNone, monthAll, yearAll, selectedMonths, selectedYears, availableYears]);

  const userIdsSel = userSel.filter((u) => u !== "unassigned" && u !== "__none");
  const unSel = !usersExplicitNone && userSel.includes("unassigned");
  const allUserIds = users.map((u) => u.id);
  const allSelectedExplicit = canFilterUsers && !usersAllMode && !usersExplicitNone && allUserIds.length > 0 && allUserIds.every((id) => userIdsSel.includes(id)) && unSel;
  const isAllUsers = usersAllMode || allSelectedExplicit;
  const userLabel = (!canFilterUsers && isRegularUser)
    ? "My data"
    : isAllUsers ? "All users" : usersExplicitNone ? "0 selected" : `${userIdsSel.length + (unSel ? 1 : 0)} selected`;

  const btnBase = "tt-btn max-w-[14rem] truncate";
  const actionBtn = "rounded-md border border-line bg-surface px-2 py-0.5 text-[11px] font-medium text-muted hover:bg-line hover:text-ink";

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Workspace filter */}
      <div>
        <button ref={wsDrop.btnRef} type="button" className={btnBase} onClick={() => wsDrop.setOpen((v) => !v)} title="Workspaces">
          <span className="truncate">{wsLabel}</span>
          <IconChevronRight className={cx("h-3.5 w-3.5 transition-transform", wsDrop.open && "rotate-90")} />
        </button>
        <Panel open={wsDrop.open} pos={wsDrop.pos} panelRef={wsDrop.panelRef}>
          <div className="mb-1 flex items-center justify-between px-1">
            <span className="font-semibold">Workspaces</span>
            <button type="button" className={actionBtn} onClick={clearWorkspaces}>Clear</button>
          </div>
          <RowBtn checked={allSelected && !wsExplicitNone && selectedWsIds.length > 0} label="All Workspaces" onClick={selectAllWorkspaces} bold />
          <RowBtn checked={allOngoingSelected && noneCompletedSelected && selectedWsIds.length > 0} label="Ongoing Workspaces" onClick={selectOngoing} bold />
          <RowBtn checked={allCompletedSelected && noneOngoingSelected && selectedWsIds.length > 0} label="Completed Workspaces" onClick={selectCompleted} bold />
          <div className="my-1 border-t border-line" />
          {ongoing.length > 0 && <div className="px-2 py-1 text-[10px] font-semibold uppercase text-muted">Ongoing</div>}
          {ongoing.map((w) => (
            <RowBtn key={w.id} checked={selectedWsSet.has(w.id)} label={`${w.key} · ${w.name}`} onClick={() => toggleWorkspace(w.id)} indent />
          ))}
          {completed.length > 0 && <div className="mt-1 px-2 py-1 text-[10px] font-semibold uppercase text-muted">Completed</div>}
          {completed.map((w) => (
            <RowBtn key={w.id} checked={selectedWsSet.has(w.id)} label={`${w.key} · ${w.name}`} onClick={() => toggleWorkspace(w.id)} indent />
          ))}
          {workspaces.length === 0 && <p className="px-2 py-1 text-muted">No workspaces.</p>}
        </Panel>
      </div>

      {/* Month & Year filter (single option/dropdown) */}
      <div>
        <button ref={periodDrop.btnRef} type="button" className={btnBase} onClick={() => periodDrop.setOpen((v) => !v)} title="Month & Year">
          <span className="truncate">{periodLabel}</span>
          <IconChevronRight className={cx("h-3.5 w-3.5 transition-transform", periodDrop.open && "rotate-90")} />
        </button>
        <Panel open={periodDrop.open} pos={periodDrop.pos} panelRef={periodDrop.panelRef} className="w-80">
          <div className="space-y-3">
            <div>
              <div className="mb-1 flex items-center justify-between gap-2 px-1">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">Month</span>
                <div className="flex items-center gap-1 rounded-md border border-line bg-surface p-0.5">
                  <button type="button" className="rounded px-2 py-0.5 text-[11px] text-muted hover:bg-line hover:text-ink" onClick={() => setMonths("all")}>Select All</button>
                  <button type="button" className="rounded px-2 py-0.5 text-[11px] text-muted hover:bg-line hover:text-ink" onClick={() => setMonths("none")}>Clear</button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-x-1">
                {MONTHS.map((name, i) => (
                  <RowBtn key={name} checked={!monthIsNone && (monthAll || monthSet.has(i + 1))} label={name} onClick={() => toggleMonth(i + 1)} />
                ))}
              </div>
            </div>
            <div className="border-t border-line pt-2">
              <div className="mb-1 flex items-center justify-between gap-2 px-1">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">Year</span>
                <div className="flex items-center gap-1 rounded-md border border-line bg-surface p-0.5">
                  <button type="button" className="rounded px-2 py-0.5 text-[11px] text-muted hover:bg-line hover:text-ink" onClick={() => setYears("all")}>Select All</button>
                  <button type="button" className="rounded px-2 py-0.5 text-[11px] text-muted hover:bg-line hover:text-ink" onClick={() => setYears("none")}>Clear</button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-x-1">
                {availableYears.map((y) => (
                  <RowBtn key={y} checked={!yearIsNone && (yearAll || yearSet.has(y))} label={String(y)} onClick={() => toggleYear(y)} />
                ))}
              </div>
              {availableYears.length === 0 && <p className="px-2 py-1 text-muted">No years available.</p>}
            </div>
          </div>
        </Panel>
      </div>

      {/* User filter */}
      <div>
        <button ref={userDrop.btnRef} type="button" className={btnBase} onClick={() => userDrop.setOpen((v) => !v)} title="User filter" disabled={!canFilterUsers && isRegularUser}>
          <span className="truncate">{userLabel}</span>
          <IconChevronRight className={cx("h-3.5 w-3.5 transition-transform", userDrop.open && "rotate-90")} />
        </button>
        <Panel open={userDrop.open} pos={userDrop.pos} panelRef={userDrop.panelRef}>
          <div className="mb-2 flex items-center justify-between gap-2 px-1">
            <span className="font-semibold">Users</span>
            <div className="flex items-center gap-1 rounded-md border border-line bg-surface p-0.5">
              <button type="button" className="rounded px-2 py-0.5 text-[11px] text-muted hover:bg-line hover:text-ink" onClick={selectAllUsers}>Select All</button>
              <button type="button" className="rounded px-2 py-0.5 text-[11px] text-muted hover:bg-line hover:text-ink" onClick={clearUsers}>Clear</button>
            </div>
          </div>
          <RowBtn checked={isAllUsers} label="All users" onClick={selectAllUsers} bold />
          <div className="my-1 border-t border-line" />
          {canFilterUsers && <RowBtn checked={isAllUsers || unSel} label="Unassigned" onClick={toggleUnassigned} />}
          {users.map((u) => (
            <RowBtn key={u.id} checked={isAllUsers || userIdsSel.includes(u.id)} label={u.id === viewerId ? `${u.name} (you)` : u.name} onClick={() => toggleUser(u.id)} />
          ))}
          {users.length === 0 && <p className="px-2 py-1 text-muted">No users available.</p>}
        </Panel>
      </div>
    </div>
  );
}