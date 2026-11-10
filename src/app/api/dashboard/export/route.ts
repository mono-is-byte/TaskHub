import * as XLSX from "xlsx";
import { requireUser } from "@/lib/api";
import { db, taskKey } from "@/lib/db";
import { dashboardLists, dashboardSummary } from "@/lib/dashboard";
import { parseDashboardFilters, resolveDashboardFilters } from "@/lib/dashboardFilters";

/**
 * Dashboard Excel export — server-side, independently validated.
 * Applies the same combined, authorized filters as the dashboard (workspace/
 * period/user) so the workbook always matches the on-screen data.
 */
export async function GET(req: Request) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;

  const url = new URL(req.url);
  // Parse all filter params (repeated + legacy)
  const sp: Record<string, string | string[] | undefined> = {};
  for (const key of ["ws", "period", "month", "year", "user", "project"]) {
    const all = url.searchParams.getAll(key);
    if (all.length === 1) sp[key] = all[0];
    else if (all.length > 1) sp[key] = all;
  }
  const state = parseDashboardFilters(sp);
  const resolved = await resolveDashboardFilters(db, { id: auth.user.id, isSuperAdmin: auth.user.isSuperAdmin }, state);

  const [summary, lists] = await Promise.all([
    dashboardSummary(db, auth.user.id, auth.user.isSuperAdmin, resolved),
    dashboardLists(db, auth.user.id, resolved),
  ]);
  const { assigned, qaQueue, overdue, recent, taskDetails } = lists;

  const wb = XLSX.utils.book_new();
  const addSheet = (name: string, aoa: (string | number)[][], opts?: { widths?: number[]; autofilter?: boolean }) => {
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    if (opts?.widths) ws["!cols"] = opts.widths.map((wch) => ({ wch }));
    if (opts?.autofilter && aoa.length > 0) {
      const lastCol = (aoa[0]?.length ?? 1) - 1;
      const lastRow = aoa.length - 1;
      const colName = (n: number) => {
        let s = "";
        let x = n + 1;
        while (x > 0) { const m = (x - 1) % 26; s = String.fromCharCode(65 + m) + s; x = Math.floor((x - 1) / 26); }
        return s;
      };
      ws["!autofilter"] = { ref: `A1:${colName(lastCol)}${lastRow + 1}` };
    }
    XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
  };

  const dateStr = (d: Date | string | null | undefined) => {
    if (!d) return "";
    const dt = d instanceof Date ? d : new Date(d);
    return Number.isNaN(dt.getTime()) ? "" : dt.toISOString().slice(0, 10);
  };

  // 1) Dashboard Summary
  addSheet("Dashboard Summary", [
    ["TaskHub Dashboard Report"],
    ["Generated", new Date().toISOString()],
    ["Workspaces", resolved.workspaceLabel],
    ["Reporting periods", resolved.periodLabel],
    ["Users", resolved.userLabel],
    [],
    ["Metric", "Value"],
    ["Workspaces in view", summary.projectCount],
    ["Total tasks", summary.totals.all],
    ["Completed", summary.totals.done],
    ["Completion %", summary.completionPct],
    ["Open", summary.totals.open],
    ["In progress", summary.totals.inProgress],
    ["Pending", summary.totals.pending],
    ["Overdue", summary.totals.overdue],
    ["My open tasks", summary.myOpen],
    ["My overdue tasks", summary.myOverdue],
    ["Timers running", summary.runningNow],
    ["Timers overdue", summary.timerOverdue],
  ], { widths: [28, 40] });

  // 2) Workspace Summary
  addSheet("Workspace Summary", [
    ["Workspace key", "Workspace name", "Total", "Completed", "Open", "Overdue"],
    ...summary.byWorkspace.map((w) => [w.key, w.name, w.total, w.done, w.open, w.overdue]),
  ], { widths: [16, 36, 10, 12, 10, 10], autofilter: true });

  // 3) Task Details (relevant tasks)
  addSheet("Task Details", [
    ["Key", "Title", "Workspace", "Status", "Priority", "Assignee", "Tester", "Due date", "Created", "Updated"],
    ...taskDetails.map((t) => [
      t.key, t.title, `${t.projectKey} · ${t.projectName}`, t.status, t.priority,
      t.assigneeName ?? "", t.testedByName ?? "", dateStr(t.endDate), dateStr(t.createdAt), dateStr(t.updatedAt),
    ]),
  ], { widths: [12, 40, 28, 16, 14, 20, 20, 12, 12, 12], autofilter: true });

  // 4) Status Breakdown
  addSheet("Status Breakdown", [
    ["Status", "Tasks"],
    ...summary.byStatus.map((s) => [s.name, s.count]),
  ], { widths: [28, 12], autofilter: true });

  // 5) Priority Breakdown
  addSheet("Priority Breakdown", [
    ["Priority", "Tasks"],
    ...summary.byPriority.map((p) => [p.name, p.count]),
  ], { widths: [28, 12], autofilter: true });

  // 6) User-wise Summary
  addSheet("User-wise Summary", [
    ["User", "Total", "Completed", "Open", "Overdue"],
    ...summary.byUser.map((u) => [u.name, u.total, u.done, u.open, u.overdue]),
  ], { widths: [28, 10, 12, 10, 10], autofilter: true });

  // Extra context sheets (kept for completeness, do not break required sheets)
  const taskLite = (t: any): (string | number)[] => [
    taskKey(t.project.key, t.serial), t.title, t.status.name, t.priority.name, t.project.name, dateStr(t.endDate),
  ];
  const tw = [12, 40, 16, 14, 26, 12];
  addSheet("Assigned", [["Key", "Task", "Status", "Priority", "Workspace", "Due"], ...assigned.map(taskLite)], { widths: tw, autofilter: true });
  addSheet("QA Queue", [["Key", "Task", "Status", "Priority", "Workspace", "Due"], ...qaQueue.map(taskLite)], { widths: tw, autofilter: true });
  addSheet("Overdue List", [["Key", "Task", "Status", "Priority", "Workspace", "Due"], ...overdue.map(taskLite)], { widths: tw, autofilter: true });
  addSheet("Recent Activity", [
    ["Task", "Title", "Change", "By", "When"],
    ...recent.map((a: any) => [
      taskKey(a.task.project.key, a.task.serial),
      a.task.title,
      `${a.action}${a.field ? `:${a.field}` : ""}`,
      a.actor?.name ?? "system",
      new Date(a.createdAt).toISOString().slice(0, 16).replace("T", " "),
    ]),
  ], { widths: [12, 40, 24, 20, 18], autofilter: true });

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  const scopeKey = resolved.projects.length === 1 ? resolved.projects[0].key : "dashboard";
  return new Response(buf as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="dashboard-${scopeKey}.xlsx"`,
    },
  });
}
