import Link from "next/link";
import { db, taskKey } from "@/lib/db";
import { requireViewer } from "@/lib/server";
import { designationLabel } from "@/lib/designation";
import { dashboardLists, dashboardSummary } from "@/lib/dashboard";
import { getAvailableYears, parseDashboardFilters, resolveDashboardFilters } from "@/lib/dashboardFilters";
import StatBar from "@/components/StatBar";
import { MobileTopBar } from "@/components/SidebarToggle";
import DashboardFilterBar from "@/components/DashboardFilterBar";
import DashboardExport from "@/components/DashboardExport";
import {
  IconAlarmClock, IconChart, IconCheckCircle, IconClipboardCheck, IconClock, IconHistory,
  IconListChecks, IconTrendUp, IconWarning,
} from "@/components/icons";

/**
 * Dashboard (home) — server-rendered from real task data only, driven by
 * centralized combined filters (workspace / period / user) with server-side
 * authorization and export consistency.
 */

const TONE = {
  indigo: "bg-[rgba(112,138,244,0.12)] text-[#708AF4]",
  emerald: "bg-[rgba(22,163,74,0.12)] text-[#16A34A]",
  sky: "bg-[rgba(112,138,244,0.12)] text-[#708AF4]",
  slate: "bg-[var(--row-hover)] text-[var(--text-secondary)]",
  red: "bg-[rgba(239,68,68,0.12)] text-[#EF4444]",
} as const;

function Kpi({
  label, value, hint, icon, tone = "indigo",
}: {
  label: string;
  value: number;
  hint: string;
  icon: React.ReactNode;
  tone?: keyof typeof TONE;
}) {
  return (
    <div className="tt-kpi">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</div>
          <div className="mt-1 text-2xl font-bold tabular-nums">{value}</div>
          <div className="truncate text-[11px] text-muted">{hint}</div>
        </div>
        <span className={`shrink-0 rounded-lg p-2 ${TONE[tone]}`} aria-hidden="true">{icon}</span>
      </div>
    </div>
  );
}

function Card({ title, icon, action, children }: {
  title: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="tt-card p-3">
      <div className="mb-2 flex items-center gap-1.5">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold">{icon}{title}</h2>
        {action && <span className="ml-auto text-xs text-muted">{action}</span>}
      </div>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded border border-dashed border-line px-3 py-2 text-xs text-muted">{children}</p>;
}

/**
 * PHASE 4: friendly text for one activity row. Assignment events (the new
 * "task.assigned" action and the legacy `task.updated` + assigneeId rows) read
 * as "assigned to <name>" / "unassigned" instead of raw ids.
 */
function activityLabel(a: { action: string; field: string | null; after: string | null; afterName?: string | null }): string {
  const isAssign = a.action === "task.assigned" || (a.action === "task.updated" && a.field === "assigneeId");
  if (isAssign) return a.after ? `assigned to ${a.afterName ?? "someone"}` : "unassigned";
  return a.field ? `${a.action}:${a.field}` : a.action;
}

export default async function MyWorkPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { user } = await requireViewer("/");
  const roleLabel = await designationLabel(db, user);
  const sp = await searchParams;

  // Centralized, server-validated filters (workspace + period + user)
  const filterState = parseDashboardFilters(sp);
  const resolved = await resolveDashboardFilters(db, { id: user.id, isSuperAdmin: user.isSuperAdmin }, filterState);

  const [lists, summary] = await Promise.all([
    dashboardLists(db, user.id, resolved),
    dashboardSummary(db, user.id, user.isSuperAdmin, resolved),
  ]);
  const { assigned, qaQueue, overdue, recent, taskDetails } = lists;

  // Options for filter UI (authorized)
  const [accessibleProjects, availableYears] = await Promise.all([
    (async () => { const { listProjectsForUser } = await import("@/lib/server"); return listProjectsForUser(user.id, user.isSuperAdmin, false, db); })(),
    getAvailableYears(db),
  ]);

  // Authorized user options for filter: admin=all non-deleted; PM=users in managed projects; regular=self
  const userOptions = await (async () => {
    if (user.isSuperAdmin) {
      const rows = await db.user.findMany({ where: { deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } });
      return rows;
    }
    // PM scope?
    const memberships = await db.projectMember.findMany({ where: { userId: user.id }, include: { roles: { include: { role: true } } } });
    const managed: string[] = [];
    for (const m of memberships) {
      for (const l of m.roles) {
        try { if ((JSON.parse(l.role.permissions || "{}") as any).manage_members === true) { managed.push(m.projectId); break; } } catch {}
      }
    }
    if (managed.length > 0) {
      const mem = await db.projectMember.findMany({ where: { projectId: { in: [...new Set(managed)] } }, select: { userId: true }, distinct: ["userId"] });
      const ids = [...new Set([...mem.map((m) => m.userId), user.id])];
      return db.user.findMany({ where: { id: { in: ids }, deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } });
    }
    return [{ id: user.id, name: user.name }];
  })();

  const canFilterUsers = user.isSuperAdmin || userOptions.length > 1 || resolved.isPmScoped;
  const isRegularUser = !user.isSuperAdmin && !resolved.isPmScoped;

  // Canonical query string for export (preserves current filters)
  const qs = new URLSearchParams();
  const appendAll = (k: string, v: string | string[] | undefined) => {
    if (v == null) return; (Array.isArray(v) ? v : [v]).forEach((x) => qs.append(k, x));
  };
  appendAll("ws", sp.ws);
  appendAll("month", sp.month);
  appendAll("year", sp.year);
  appendAll("period", sp.period); // legacy compat
  appendAll("user", sp.user);
  const queryString = qs.toString();

  const lite = (t: any) => ({
    key: taskKey(t.project.key, t.serial),
    title: t.title,
    status: t.status.name,
    priority: t.priority.name,
    due: t.endDate ? new Date(t.endDate).toISOString().slice(0, 10) : "—",
    workspace: `${t.project.key} · ${t.project.name}`,
    assignee: t.assignee?.name ?? "",
  });

  const detailLite = (t: any) => ({
    key: t.key,
    title: t.title,
    status: t.status,
    priority: t.priority,
    due: t.endDate ? new Date(t.endDate).toISOString().slice(0, 10) : "—",
    workspace: `${t.projectKey} · ${t.projectName}`,
    assignee: t.assigneeName ?? "",
  });

  function row(t: (typeof assigned)[number]) {
    return (
      <li key={t.id} className="flex items-center gap-2 rounded border bg-surface px-2 py-1 text-sm border-line">
        <span className="font-mono text-xs text-muted">{taskKey(t.project.key, t.serial)}</span>
        <Link href={`/p/${t.projectId}/board?task=${t.id}`} className="min-w-0 flex-1 truncate hover:underline">
          {t.title}
        </Link>
        <span className="rounded px-1 text-xs" style={{ background: `${t.status.color}22`, color: t.status.color }}>{t.status.name}</span>
        <span className="text-xs" style={{ color: t.priority.color }}>● {t.priority.name}</span>
      </li>
    );
  }

  const { totals } = summary;
  const pct = (n: number) => (totals.all === 0 ? "0%" : `${Math.round((n / totals.all) * 100)}% of all`);

  return (
    <div>
      {/* Mobile-only shared top bar: [TaskHub icon] + title (opens the drawer). */}
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <div className="flex items-center gap-2.5">
            <MobileTopBar />
            <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          </div>
          <p className="text-sm text-muted">
            Welcome back, {user.name} · {summary.projectCount} workspace{summary.projectCount === 1 ? "" : "s"} in view
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DashboardFilterBar
            workspaces={accessibleProjects.map((p: any) => ({ id: p.id, key: p.key, name: p.name, isCompleted: !!p.isCompleted }))}
            availableYears={availableYears}
            users={userOptions}
            canFilterUsers={canFilterUsers}
            isRegularUser={isRegularUser}
            viewerId={user.id}
          />
          <DashboardExport
            queryString={queryString}
            scopeKey={resolved.projects.length === 1 ? resolved.projects[0].key : "dashboard"}
            workspaceLabel={resolved.workspaceLabel}
            periodLabel={resolved.periodLabel}
            userLabel={resolved.userLabel}
            summary={summary}
            assigned={assigned.map(lite)}
            qaQueue={qaQueue.map(lite)}
            overdue={overdue.map(lite)}
            recent={recent.map((a: any) => ({
              key: taskKey(a.task.project.key, a.task.serial),
              title: a.task.title,
              action: activityLabel(a),
              actor: a.actor?.name ?? "system",
              when: new Date(a.createdAt).toISOString().slice(0, 16).replace("T", " "),
            }))}
            taskDetails={taskDetails.map(detailLite)}
          />
          <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${user.isSuperAdmin ? "border-[rgba(237,194,17,0.45)] bg-[rgba(237,194,17,0.16)] text-[#111827] dark:text-[#EDC211]" : "border-line bg-surface text-muted"}`}>
            {roleLabel}
          </span>
        </div>
      </div>

      {/* KPI cards — every number is derived from the saved tasks. */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Kpi label="Total tasks" value={totals.all} hint={pct(totals.all)} icon={<IconListChecks className="h-4 w-4" />} tone="indigo" />
        <Kpi label="Completed" value={totals.done} hint={`${summary.completionPct}% done`} icon={<IconCheckCircle className="h-4 w-4" />} tone="emerald" />
        <Kpi label="In progress" value={totals.inProgress} hint={pct(totals.inProgress)} icon={<IconClock className="h-4 w-4" />} tone="sky" />
        <Kpi label="Pending" value={totals.pending} hint={pct(totals.pending)} icon={<IconHistory className="h-4 w-4" />} tone="slate" />
        <Kpi label="Overdue" value={totals.overdue} hint={totals.overdue > 0 ? "past the due date" : "nothing overdue"} icon={<IconWarning className="h-4 w-4" />} tone="red" />
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-4">
        <Card title="Completion & timers" icon={<IconTrendUp className="h-4 w-4 text-[#16A34A]" />}>
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold">Completion rate</span>
            <span className="tabular-nums text-muted">{summary.completionPct}%</span>
          </div>
          <div
            className="mt-2 h-2 w-full overflow-hidden rounded-full bg-line"
            role="progressbar"
            aria-label="Completion rate"
            aria-valuenow={summary.completionPct}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div className="h-full rounded-full transition-all" style={{ width: `${summary.completionPct}%`, backgroundColor: "#16A34A" }} />
          </div>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted">
            <span>{totals.done} of {totals.all} done</span>
            <span>· {totals.open} open</span>
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
            <span className="inline-flex items-center gap-1 text-muted">
              <IconClock className="h-3 w-3" /> {summary.runningNow} timer{summary.runningNow === 1 ? "" : "s"} running
            </span>
            {summary.timerOverdue > 0 && (
              <span className="inline-flex items-center gap-1 text-[#EF4444]">
                <IconAlarmClock className="h-3 w-3" /> {summary.timerOverdue} timer overdue
              </span>
            )}
          </div>
        </Card>

        <Card title="Tasks by status" icon={<IconChart className="h-4 w-4 text-muted" />}>
          <div className="flex flex-col gap-1">
            {summary.byStatus.length === 0 && <Empty>No tasks yet.</Empty>}
            {summary.byStatus.map((s) => (
              <StatBar key={s.id} label={s.name} value={s.count} max={Math.max(1, ...summary.byStatus.map((x) => x.count))} color={s.color} />
            ))}
          </div>
        </Card>

        <Card title="Tasks by priority" icon={<IconChart className="h-4 w-4 text-muted" />}>
          <div className="flex flex-col gap-1">
            {summary.byPriority.length === 0 && <Empty>No tasks yet.</Empty>}
            {summary.byPriority.map((p) => (
              <StatBar key={p.name} label={p.name} value={p.count} max={Math.max(1, ...summary.byPriority.map((x) => x.count))} color={p.color} />
            ))}
          </div>
        </Card>

        <Card title="Open tasks per member" icon={<IconChart className="h-4 w-4 text-muted" />}>
          <div className="flex flex-col gap-1">
            {summary.perMember.length === 0 && <Empty>No open tasks.</Empty>}
            {summary.perMember.map((m) => (
              <StatBar key={m.userId} label={m.name} value={m.count} max={Math.max(1, ...summary.perMember.map((x) => x.count))} color="#708AF4" />
            ))}
          </div>
        </Card>
      </div>

      {accessibleProjects.length === 0 && (
        <p className="mt-3 rounded border bg-surface p-4 text-sm border-line">
          You are not a member of any project yet. Ask an administrator to add you.
        </p>
      )}

      {accessibleProjects.length > 0 && resolved.projectIds.length === 0 && (
        <p className="mt-3 rounded border border-dashed border-line bg-surface p-4 text-sm text-muted">
          No workspaces selected. Use the workspace filter to choose workspaces.
        </p>
      )}

      {accessibleProjects.length > 0 && resolved.projectIds.length > 0 && resolved.periods !== null && resolved.periods.length === 0 && (
        <p className="mt-3 rounded border border-dashed border-line bg-surface p-4 text-sm text-muted">
          No months or years selected. Use the Month and Year filters to choose a reporting period.
        </p>
      )}

      {accessibleProjects.length > 0 && resolved.projectIds.length > 0 && !(resolved.periods !== null && resolved.periods.length === 0) && (
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <Card
            title={`Assigned to me (${assigned.length})`}
            icon={<IconListChecks className="h-4 w-4 text-muted" />}
            action={summary.myOpen > 0 ? <>{summary.myOpen} open{summary.myOverdue > 0 ? ` · ${summary.myOverdue} overdue` : ""}</> : undefined}
          >
            {assigned.length === 0 ? <Empty>Nothing assigned to you right now.</Empty> : <ul className="flex flex-col gap-1">{assigned.map(row)}</ul>}
          </Card>

          <Card title={`Waiting for my testing (${qaQueue.length})`} icon={<IconClipboardCheck className="h-4 w-4 text-muted" />}>
            {qaQueue.length === 0 ? <Empty>No task is waiting for your testing.</Empty> : <ul className="flex flex-col gap-1">{qaQueue.map(row)}</ul>}
          </Card>

          <Card
            title={`Overdue (${overdue.length})`}
            icon={<IconAlarmClock className="h-4 w-4 text-[#EF4444]" />}
          >
            {overdue.length === 0 ? <Empty>Nothing overdue — nice.</Empty> : <ul className="flex flex-col gap-1">{overdue.map(row)}</ul>}
          </Card>

          <Card title="Recently changed" icon={<IconHistory className="h-4 w-4 text-muted" />}>
            {recent.length === 0 ? (
              <Empty>No activity yet.</Empty>
            ) : (
              /* Item 8: capped + scrollable so the feed never stretches the dashboard. */
              <ul className="scroll-thin flex max-h-44 flex-col gap-1 overflow-y-auto overscroll-contain">
                {recent.map((a) => (
                  <li key={a.id} className="rounded border bg-surface px-2 py-1 text-xs border-line">
                    <span className="font-mono text-muted">{taskKey(a.task.project.key, a.task.serial)}</span>{" "}
                    <Link href={`/p/${a.task.projectId}/board?task=${a.taskId}`} className="hover:underline">{a.task.title}</Link>
                    <span className="text-muted"> — {a.actor?.name ?? "system"} · {activityLabel(a)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}

      {accessibleProjects.length > 0 && (
        <div className="mt-4 space-y-3">
          {accessibleProjects.filter((p: any) => !p.isCompleted).length > 0 && (
            <div>
              <h2 className="mb-2 text-sm font-semibold">WORKSPACES</h2>
              <div className="flex flex-wrap gap-2">
                {accessibleProjects.filter((p: any) => !p.isCompleted).map((p: any) => (
                  <Link key={p.id} href={`/p/${p.id}/board`} className="tt-card px-3 py-2 text-sm transition-shadow hover:shadow">
                    <span className="font-mono text-xs text-muted">{p.key}</span> {p.name}
                  </Link>
                ))}
              </div>
            </div>
          )}
          {accessibleProjects.filter((p: any) => p.isCompleted).length > 0 && (
            <div>
              <h2 className="mb-2 text-sm font-semibold">COMPLETED</h2>
              <div className="flex flex-wrap gap-2">
                {accessibleProjects.filter((p: any) => p.isCompleted).map((p: any) => (
                  <Link key={p.id} href={`/p/${p.id}/board`} className="tt-card px-3 py-2 text-sm transition-shadow hover:shadow">
                    <span className="font-mono text-xs text-muted">{p.key}</span> {p.name}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
