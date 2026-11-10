"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/client";
import ConfirmDialog from "@/components/ConfirmDialog";
import { dayKey, isWeekendDay } from "@/lib/calendar";
import {
  HOLIDAY_TYPES, HOLIDAY_TYPE_LABEL, dayKeysBetween, holidayCoversDay, parseDayKey,
  type ExceptionRow,
} from "@/lib/holidayDates";
import { IconFlag, IconPencil, IconSliders, IconSun, IconTrash } from "@/components/icons";

/**
 * "Calendar Settings" lives inside the Calendar page and manages the GLOBAL
 * holiday list + working-day exceptions (holidays are for everyone — there is
 * no project scope anywhere). Admin-only to add/edit/delete; every delete goes
 * through the shared ConfirmDialog. On any change the parent reloads the
 * calendar so the grid names and colours update.
 *
 * Holidays are date RANGES: start + optional end (same day = single-day
 * holiday); every day in between is covered, inclusive. A working-day
 * exception ("office open") is stored separately and never modifies the
 * holiday row, so removing it restores the original holiday status.
 */

export interface HolidayRow {
  id: string;
  startDate: string;
  endDate: string;
  name: string;
  description: string;
  type: string;
  canManage: boolean;
}

const inp = "tt-input !h-7 !min-h-0 !px-2 !py-0.5 !text-xs";
const btn = "tt-btn !h-7 !min-h-0 !px-2.5 !py-0 !text-xs";

interface EditState {
  startDate: string;
  endDate: string;
  name: string;
  type: string;
}

function fmtDay(key: string): string {
  const d = parseDayKey(key);
  return d ? d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : key;
}

function fmtSpan(h: { startDate: string; endDate: string }): string {
  if (!h.endDate || h.endDate === h.startDate) return fmtDay(h.startDate);
  const days = dayKeysBetween(h.startDate, h.endDate).length;
  return `${fmtDay(h.startDate)} → ${fmtDay(h.endDate)}${days ? ` (${days} days)` : ""}`;
}

export default function CalendarSettings({
  onClose,
  onChanged,
}: {
  onClose: () => void;
  onChanged: () => void;
}) {
  const [rows, setRows] = useState<HolidayRow[] | null>(null);
  const [exceptions, setExceptions] = useState<ExceptionRow[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState("");
  const [add, setAdd] = useState({ startDate: dayKey(new Date()), endDate: "", name: "", type: "public" });
  const [edits, setEdits] = useState<Record<string, EditState>>({});
  const [deleting, setDeleting] = useState<HolidayRow | null>(null);
  const [exNoteDrafts, setExNoteDrafts] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      const d = await api<{ holidays: HolidayRow[]; exceptions: ExceptionRow[]; canManageGlobal: boolean }>("/api/holidays");
      setRows(d.holidays);
      const ex = d.exceptions ?? [];
      setExceptions(ex);
      setExNoteDrafts(Object.fromEntries(ex.map((e) => [e.date, e.note ?? ""])));
      setCanManage(d.canManageGlobal === true);
      setErr("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load holidays.");
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  /** Why does a date need an exception? (what removing it would restore) */
  const underlying = useMemo(() => {
    const map = new Map<string, string>();
    for (const e of exceptions) {
      const d = parseDayKey(e.date);
      const hol = (rows ?? []).find((h) => holidayCoversDay(h, e.date));
      let weekdayLabel = "";
      if (d) {
        const parts = e.date.split("-").map(Number);
        const local = parts.length === 3 ? new Date(parts[0], parts[1] - 1, parts[2]) : d;
        weekdayLabel = local.toLocaleDateString("en-US", { weekday: "long" });
      }
      map.set(
        e.date,
        hol ? `was the holiday “${hol.name || "Holiday"}”` :
        d && isWeekendDay(d) ? `was a weekly holiday (${weekdayLabel || "Fri/Sat"})` :
        "was already a working day",
      );
    }
    return map;
  }, [exceptions, rows]);

  const addRangeError = useMemo(() => {
    if (!add.startDate) return "";
    if (add.endDate && add.endDate < add.startDate) return "The end date cannot be earlier than the start date.";
    if (add.endDate && dayKeysBetween(add.startDate, add.endDate).length === 0) return "The range is too long (maximum 366 days).";
    return "";
  }, [add.startDate, add.endDate]);

  async function addHoliday() {
    setBusy("add"); setErr(""); setMsg("");
    try {
      await api("/api/holidays", {
        method: "POST",
        body: JSON.stringify({
          startDate: add.startDate,
          endDate: add.endDate || add.startDate,
          name: add.name,
          type: add.type,
        }),
      });
      const end = add.endDate || add.startDate;
      setMsg(end === add.startDate ? `Holiday added on ${fmtDay(add.startDate)}.` : `Holiday added for ${fmtSpan({ startDate: add.startDate, endDate: end })}.`);
      setAdd({ startDate: dayKey(new Date()), endDate: "", name: "", type: "public" });
      await load();
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not add the holiday.");
    } finally { setBusy(""); }
  }

  function startEdit(h: HolidayRow) {
    setErr("");
    setMsg("");
    setEdits((m) => ({ ...m, [h.id]: { startDate: h.startDate, endDate: h.endDate, name: h.name, type: h.type } }));
  }

  function cancelEdit(id: string) {
    setEdits((m) => { const next = { ...m }; delete next[id]; return next; });
  }

  async function saveHoliday(row: HolidayRow) {
    const edit = edits[row.id];
    if (!edit) return;
    if (edit.endDate && edit.endDate < edit.startDate) {
      setErr("The end date cannot be earlier than the start date.");
      return;
    }
    setBusy(row.id); setErr(""); setMsg("");
    try {
      // `description` is intentionally not sent: the UI no longer edits it, and
      // the API keeps the stored value when the field is omitted.
      await api(`/api/holidays?id=${row.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          startDate: edit.startDate,
          endDate: edit.endDate || edit.startDate,
          name: edit.name,
          type: edit.type,
        }),
      });
      setEdits((m) => { const next = { ...m }; delete next[row.id]; return next; });
      setMsg(`“${edit.name || row.name}” updated.`);
      await load();
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not update the holiday.");
    } finally { setBusy(""); }
  }

  async function deleteHoliday() {
    if (!deleting) return;
    setBusy("delete"); setErr("");
    try {
      await api(`/api/holidays?id=${deleting.id}`, { method: "DELETE" });
      setMsg(`Holiday “${deleting.name || deleting.startDate}” deleted — capacity counts those days again.`);
      setDeleting(null);
      await load();
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not delete the holiday.");
      setDeleting(null);
    } finally { setBusy(""); }
  }

  async function removeException(date: string) {
    setBusy(`ex-${date}`); setErr(""); setMsg("");
    try {
      await api(`/api/working-days?date=${date}`, { method: "DELETE" });
      setMsg(`${fmtDay(date)}: working-day exception removed — the original status is restored.`);
      await load();
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not remove the exception.");
    } finally { setBusy(""); }
  }

  async function saveExceptionNote(date: string) {
    const note = (exNoteDrafts[date] ?? "").trim();
    const current = exceptions.find((e) => e.date === date)?.note ?? "";
    if (note === current) return;
    setBusy(`ex-note-${date}`); setErr(""); setMsg("");
    try {
      await api("/api/working-days", { method: "POST", body: JSON.stringify({ date, note }) });
      setMsg(`${fmtDay(date)}: note updated.`);
      await load();
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not update the note.");
    } finally { setBusy(""); }
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center overflow-auto bg-[rgba(17,24,39,0.45)] p-4 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label="Calendar Settings — holidays and working days"
        className="tt-card mt-10 max-h-[85vh] w-[52rem] max-w-full overflow-auto p-5 text-sm shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex flex-wrap items-center gap-2 border-b border-line pb-3">
          <h2 className="inline-flex items-center gap-2 text-base font-semibold text-[var(--text)]"><span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-[rgba(112,138,244,0.12)] text-[#708AF4]"><IconSliders className="h-4 w-4" /></span> Calendar Settings</h2>
          <span className="text-xs text-muted">Holidays and working days are global (all projects).</span>
          <button onClick={onClose} className={`${btn} ml-auto`} aria-label="Close calendar settings">Close</button>
        </div>

        {msg && <p className="mb-3 rounded-md border border-[rgba(22,163,74,0.3)] bg-[rgba(22,163,74,0.12)] px-3 py-2 text-xs text-[#16A34A]" role="status">{msg}</p>}
        {err && <p className="mb-3 rounded-md border border-[rgba(239,68,68,0.3)] bg-[rgba(239,68,68,0.12)] px-3 py-2 text-xs text-[#EF4444]" role="alert">{err}</p>}

        {rows !== null && !canManage && (
          <p className="mb-3 text-xs text-muted">
            You can view holidays and working days here; adding or editing needs Admin rights.
          </p>
        )}

        {/* ── Holidays (date ranges) ─────────────────────────────────────── */}
        <section className="tt-card bg-[var(--row-hover)] p-3">
          <h3 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
            <IconFlag className="h-3.5 w-3.5 text-[#708AF4]" /> Holidays (date ranges)
          </h3>
          {canManage && (
            <div className="mb-3 rounded-md border border-line bg-surface p-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-nowrap sm:items-end">
                <label className="min-w-0 text-xs sm:flex-1">
                  <span className="block">Holiday name</span>
                  <input
                    value={add.name}
                    onChange={(e) => setAdd({ ...add, name: e.target.value })}
                    placeholder="e.g. Eid holiday"
                    maxLength={120}
                    className={`${inp} mt-1 block w-full`}
                    aria-label="Holiday name"
                  />
                </label>
                <label className="min-w-0 text-xs sm:flex-1">
                  <span className="block">Start date</span>
                  <input type="date" value={add.startDate} onChange={(e) => setAdd({ ...add, startDate: e.target.value })} className={`${inp} mt-1 block w-full`} aria-label="Holiday start date" />
                </label>
                <label className="min-w-0 text-xs sm:flex-1">
                  <span className="block">End date <span className="text-muted">(optional)</span></span>
                  <input type="date" value={add.endDate} min={add.startDate || undefined} onChange={(e) => setAdd({ ...add, endDate: e.target.value })} className={`${inp} mt-1 block w-full`} aria-label="Holiday end date" />
                </label>
                <label className="min-w-0 text-xs sm:flex-1">
                  <span className="block">Type</span>
                  <select value={add.type} onChange={(e) => setAdd({ ...add, type: e.target.value })} className={`${inp} mt-1 block w-full`} aria-label="Holiday type">
                    {HOLIDAY_TYPES.map((t) => <option key={t} value={t}>{HOLIDAY_TYPE_LABEL[t]}</option>)}
                  </select>
                </label>
                <label className="shrink-0 text-xs">
                  <span className="invisible block">Action</span>
                  <button
                    onClick={() => void addHoliday()}
                    disabled={!add.name.trim() || !add.startDate || busy === "add" || Boolean(addRangeError)}
                    className="tt-btn-primary mt-1 h-8 whitespace-nowrap px-3 text-xs font-medium"
                    title={addRangeError || "Adds every date in the range"}
                  >
                    Add holiday
                  </button>
                </label>
              </div>
              {addRangeError && <p className="mt-1 text-xs text-[#EF4444]">{addRangeError}</p>}
              {add.endDate === "" && add.startDate && (
                <p className="mt-1 text-[11px] text-muted">Leave the end date empty for a single-day holiday.</p>
              )}
            </div>
          )}

        {rows === null && !err && <p className="text-xs text-muted">Loading holidays…</p>}
        {rows && rows.length === 0 && <p className="text-xs text-muted">No holidays yet.</p>}
        {rows && rows.length > 0 && (
          <div className="overflow-x-auto rounded-md border border-line bg-surface">
            <table className="tt-table w-full min-w-0 text-xs">
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th className="px-1.5 py-1.5 font-medium">Dates</th>
                  <th className="px-1.5 py-1.5 font-medium">Name</th>
                  <th className="px-1.5 py-1.5 font-medium">Type</th>
                  <th className="px-1.5 py-1.5 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((h) => {
                  const edit = edits[h.id];
                  const invalidRange = Boolean(edit && edit.endDate && edit.endDate < edit.startDate);
                  const editInput = "tt-input !h-7 min-h-0 w-0 min-w-0 flex-1 !px-1 !py-0 !text-[11px] !leading-tight";
                  const rowActionBtn = "tt-btn !h-7 !min-h-0 !px-1.5 !py-0 !text-[11px]";
                  const rowActionPrimary = "tt-btn-primary !h-7 !min-h-0 !px-1.5 !py-0 !text-[11px] !font-medium";
                  const rowActionDanger = "inline-flex h-7 items-center rounded-md border border-[rgba(239,68,68,0.35)] px-1.5 text-[11px] font-medium text-[#EF4444] hover:bg-[rgba(239,68,68,0.1)] disabled:opacity-50";
                  return (
                    <tr key={h.id} className="border-t border-line align-middle">
                      <td className="px-1.5 py-1.5 align-middle">
                        {edit ? (
                          <div className="space-y-0.5">
                            <div className="flex flex-nowrap items-center gap-0.5">
                              <input type="date" value={edit.startDate} onChange={(e) => setEdits((m) => ({ ...m, [h.id]: { ...edit, startDate: e.target.value } }))} className={editInput} aria-label={`${h.name} start date`} />
                              <span className="shrink-0 text-[11px] text-muted">→</span>
                              <input type="date" value={edit.endDate} min={edit.startDate} onChange={(e) => setEdits((m) => ({ ...m, [h.id]: { ...edit, endDate: e.target.value } }))} className={editInput} aria-label={`${h.name} end date`} />
                            </div>
                            {invalidRange && <span className="block text-[11px] text-[#EF4444]">Invalid range</span>}
                          </div>
                        ) : (
                          <span className="block truncate text-xs text-[var(--text)]" title={fmtSpan(h)}>{fmtSpan(h)}</span>
                        )}
                      </td>
                      <td className="px-1.5 py-1.5 align-middle">
                        {edit ? (
                          <input value={edit.name} maxLength={120} placeholder="Holiday name" onChange={(e) => setEdits((m) => ({ ...m, [h.id]: { ...edit, name: e.target.value } }))} className="tt-input !h-7 min-h-0 w-full min-w-0 !px-1 !py-0 !text-[11px] !leading-tight" aria-label={`${h.startDate} holiday name`} />
                        ) : (
                          <span className="inline-flex min-w-0 items-center gap-1 text-xs text-[var(--text)]"><IconFlag className="h-3.5 w-3.5 shrink-0 text-[#708AF4]" /> <span className="truncate">{h.name || "(holiday)"}</span></span>
                        )}
                      </td>
                      <td className="px-1.5 py-1.5 align-middle">
                        {edit ? (
                          <select value={edit.type} onChange={(e) => setEdits((m) => ({ ...m, [h.id]: { ...edit, type: e.target.value } }))} className="tt-input !h-7 min-h-0 w-full min-w-0 !px-1 !py-0 !text-[11px] !leading-tight" aria-label={`${h.name} type`}>
                            {HOLIDAY_TYPES.map((t) => <option key={t} value={t}>{HOLIDAY_TYPE_LABEL[t]}</option>)}
                          </select>
                        ) : (
                          <span className="block truncate text-xs text-[var(--text)]" title={HOLIDAY_TYPE_LABEL[h.type] ?? h.type}>{HOLIDAY_TYPE_LABEL[h.type] ?? h.type}</span>
                        )}
                      </td>
                      <td className="px-1.5 py-1.5 align-middle">
                        {h.canManage && (
                          <span className="flex flex-wrap items-center justify-end gap-0.5">
                            {edit ? (
                              <>
                                <button onClick={() => void saveHoliday(h)} disabled={busy === h.id || invalidRange} className={rowActionPrimary} title="Save">Save</button>
                                <button onClick={() => cancelEdit(h.id)} disabled={busy === h.id} className={rowActionBtn} title="Cancel">Cancel</button>
                              </>
                            ) : (
                              <>
                                <button onClick={() => startEdit(h)} className={rowActionBtn} title="Edit"><IconPencil className="h-3.5 w-3.5" /></button>
                                <button onClick={() => setDeleting(h)} className={rowActionDanger} title="Delete" aria-label={`Delete ${h.name || h.startDate}`}>
                                  <IconTrash className="h-3.5 w-3.5" />
                                </button>
                              </>
                            )}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        </section>

        {/* ── Working-day exceptions ─────────────────────────────────────── */}
        <section className="tt-card mt-4 bg-[var(--row-hover)] p-3">
          <h3 className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
            <IconSun className="h-3.5 w-3.5 text-[#EDC211]" /> Working-day exceptions (office open)
          </h3>
          <p className="mb-3 text-[11px] text-muted">
            An exception overrides the weekly holiday (Fri/Sat) and any configured holiday for that date. The holiday
            itself is kept — removing the exception restores it.
          </p>

          {exceptions.length === 0 ? (
            <p className="text-xs text-muted">No working-day exceptions.</p>
          ) : (
            <div className="overflow-x-hidden rounded-md border border-line bg-surface">
              <table className="tt-table w-full table-fixed text-xs">
                <colgroup>
                  <col style={{ width: "18%" }} />
                  <col style={{ width: "22%" }} />
                  <col style={{ width: "42%" }} />
                  <col style={{ width: "18%" }} />
                </colgroup>
                <thead>
                  <tr className="text-left text-xs text-muted">
                    <th className="px-2 py-1.5 font-medium">Date</th>
                    <th className="px-2 py-1.5 font-medium">Note</th>
                    <th className="px-2 py-1.5 font-medium">Overrides</th>
                    <th className="px-2 py-1.5 font-medium text-right" />
                  </tr>
                </thead>
                <tbody>
                  {exceptions.map((e) => (
                    <tr key={e.id} className="border-t border-line align-middle">
                      <td className="px-2 py-1.5 text-xs text-[var(--text)]">{fmtDay(e.date)}</td>
                      <td className="px-2 py-1.5 text-xs text-muted">
                        {canManage ? (
                          <input
                            value={exNoteDrafts[e.date] ?? e.note ?? ""}
                            onChange={(ev) => setExNoteDrafts((m) => ({ ...m, [e.date]: ev.target.value }))}
                            onBlur={() => void saveExceptionNote(e.date)}
                            onKeyDown={(ev) => { if (ev.key === "Enter") { ev.currentTarget.blur(); } }}
                            maxLength={300}
                            placeholder="Add note"
                            className="tt-input !h-7 !min-h-0 w-full min-w-0 !px-2 !py-0.5 !text-xs"
                            aria-label={`Note for ${fmtDay(e.date)}`}
                            title={exNoteDrafts[e.date] ?? e.note ?? ""}
                          />
                        ) : (
                          <span className="block truncate" title={e.note || "—"}>{e.note || "—"}</span>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-xs text-muted" title={underlying.get(e.date) ?? "—"}>{underlying.get(e.date) ?? "—"}</td>
                      <td className="px-2 py-1.5">
                        {canManage && (
                          <span className="flex justify-end">
                            <button
                              onClick={() => void removeException(e.date)}
                              disabled={busy === `ex-${e.date}`}
                              className="tt-btn !h-8 !min-h-0 !px-2.5 !py-0 !text-xs"
                              title="Remove the exception and restore the original holiday status"
                            >
                              Restore holiday
                            </button>
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {canManage && rows && rows.length > 0 && (
            <p className="mt-3 flex items-center gap-1 text-xs text-muted">
              <IconPencil className="h-3.5 w-3.5" /> Click <span className="font-semibold text-[var(--text)]">Edit</span> on a row to change its dates, name or type — Save stores it, Cancel leaves the holiday untouched.
            </p>
          )}
        </section>
      </div>

      {deleting && (
        // Keeps the confirm dialog's backdrop clicks from closing the settings modal too.
        <div onClick={(e) => e.stopPropagation()}>
          <ConfirmDialog
            title={`Delete holiday “${deleting.name || deleting.startDate}”?`}
            body={`${fmtSpan(deleting)} (all projects) — capacity calculations will count ${deleting.endDate && deleting.endDate !== deleting.startDate ? "these days" : "this day"} again.`}
            confirmLabel="Delete holiday"
            busy={busy === "delete"}
            onCancel={() => setDeleting(null)}
            onConfirm={() => void deleteHoliday()}
          />
        </div>
      )}
    </div>
  );
}
