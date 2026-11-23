import Link from "next/link";
import { db, taskKey } from "@/lib/db";
import { requireViewer } from "@/lib/server";
import { designationLabel } from "@/lib/designation";
import { dashboardSummary, dhakaDayKey, percentageOf, todayDhaka } from "@/lib/dashboard";
import { getAvailableYears, parseDashboardFilters, resolveDashboardFilters } from "@/lib/dashboardFilters";
import StatBar from "@/components/StatBar";
import ViewportSwitch from "@/components/ViewportSwitch";
import DashboardFilterBar from "@/components/DashboardFilterBar";
import DashboardExport, { DashScroll } from "@/components/DashboardExport";
import {
  IconAlarmClock, IconChart, IconCheckCircle, IconClipboardCheck, IconClock, IconHistory,
  IconListChecks, IconTrendUp, IconUserMinus, IconWarning,
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
  amber: "bg-[rgba(245,158,11,0.14)] text-[#F59E0B]",
  violet: "bg-[rgba(168,85,247,0.14)] text-[#A855F7]",
} as const;

// Type scale: mobile compact (<640px), desktop unchanged at sm.
const TY = {
  pageTitle: "text-[20px] font-bold leading-[1.25] sm:text-[24px]",
  pageSub: "text-[13px] leading-[1.4] text-muted",
  filter: "text-[12px] font-medium leading-[1.4]",
  cardTitle: "text-[13px] font-semibold leading-[1.35] sm:text-[14px] sm:leading-[1.4]",
  cardMeta: "text-[11px] leading-[1.35] text-muted sm:text-[12px] sm:leading-[1.4]",
  statLabel: "text-[11px] font-semibold uppercase tracking-[0.04em] leading-[1.4] text-muted",
  statNum: "text-[24px] font-bold leading-[1.25] tabular-nums sm:text-[28px]",
  statSub: "text-[11px] leading-[1.4] text-muted",
  chart: "text-[11px] leading-[1.35] sm:text-[12px] sm:leading-[1.4]",
  small: "text-[11px] leading-[1.35] text-muted sm:text-[12px] sm:leading-[1.4]",
  rowTitle: "text-[12px] leading-[1.35] sm:text-[13px] sm:leading-[1.4]",
  rowId: "font-mono text-[10px] leading-[1.35] text-muted sm:text-[11px] sm:leading-[1.4]",
  badge: "text-[10px] font-medium leading-[1.35] sm:text-[11px] sm:leading-[1.4]",
  recent: "text-[11px] leading-[1.35] sm:text-[12px] sm:leading-[1.4]",
  chip: "text-[12px] font-medium leading-[1.35] sm:text-[13px] sm:leading-[1.4]",
  chipCode: "font-mono text-[10px] leading-[1.35] text-muted sm:text-[11px] sm:leading-[1.4]",
  empty: "text-[11px] leading-[1.35] text-muted sm:text-[12px] sm:leading-[1.4]",
} as const;

function Kpi({
  label, value, hint, icon, tone = "indigo", className = "",
}: {
  label: string;
  value: number;
  hint: string;
  icon: React.ReactNode;
  tone?: keyof typeof TONE;
  className?: string;
}) {
  return (
    /* One card component for every breakpoint. Phones get a compact 2-up tile
       (small icon, uppercase label, large number, tiny percentage); from `sm`
       up the original desktop spacing/size returns. Layout only — the numbers
       come from the same server-side selector on every screen. */
    <div className={`tt-kpi min-w-0 p-2.5 sm:p-3.5 ${className}`}>
      <div className="flex items-start justify-between gap-1.5 sm:gap-2">
        <div className="min-w-0">
          <div className={`truncate ${TY.statLabel}`}>{label}</div>
          <div className={`mt-0.5 sm:mt-1 ${TY.statNum}`}>{value}</div>
          <div className={`truncate ${TY.statSub}`}>{hint}</div>
        </div>
        <span className={`shrink-0 rounded-lg p-1.5 sm:p-2 ${TONE[tone]}`} aria-hidden="true">{icon}</span>
      </div>
    </div>
  );
}

function Card({ title, icon, action, children, className = "", bodyClassName = "", bodyStyle, cardStyle }: {
  title: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  bodyStyle?: React.CSSProperties;
  cardStyle?: React.CSSProperties;
}) {
  return (
    <section className={`tt-card flex min-w-0 flex-col overflow-hidden px-3 py-2.5 sm:p-3 ${className}`.trim()} style={cardStyle}>
      <div className="mb-2 flex shrink-0 items-center gap-1.5">
        <h2 className={`flex items-center gap-1.5 ${TY.cardTitle}`}>{icon ? <span className="flex items-center [&>svg]:!h-3.5 [&>svg]:!w-3.5 sm:[&>svg]:!h-4 sm:[&>svg]:!w-4">{icon}</span> : null}{title}</h2>
        {action && <span className={`ml-auto ${TY.cardMeta}`}>{action}</span>}
      </div>
      <div className={bodyClassName} style={bodyStyle}>{children}</div>
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className={`rounded border border-dashed border-line px-3 py-2 ${TY.empty}`}>{children}</p>;
}

const ROW_H = 40;

function ListCard({ title, icon, action, itemCount, empty, children }: {
  title: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  itemCount: number;
  empty: string;
  children: React.ReactNode;
}) {
  return (
    <section style={{ alignSelf: "start" }} className="tt-card flex min-w-0 flex-col px-3 py-2.5 sm:p-3">
      <div className="mb-2 flex shrink-0 items-center gap-1.5">
        <h2 className={`flex min-w-0 items-center gap-1.5 ${TY.cardTitle}`}>{icon ? <span className="flex items-center [&>svg]:!h-3.5 [&>svg]:!w-3.5 sm:[&>svg]:!h-4 sm:[&>svg]:!w-4">{icon}</span> : null}<span className="truncate">{title}</span></h2>
        {action && <span className={`ml-auto shrink-0 ${TY.cardMeta}`}>{action}</span>}
      </div>
      <DashScroll itemCount={itemCount}>
        {children}
        {itemCount === 0 && <div className={`px-2.5 py-2 ${TY.empty}`}>{empty}</div>}
      </DashScroll>
    </section>
  );
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

  const summary = await dashboardSummary(db, user.id, user.isSuperAdmin, resolved);
  const { assigned, qaQueue, overdue, recent, taskDetails } = summary.lists;
  const today = todayDhaka();
  const assignedOpen = assigned.length;
  const assignedOverdue = assigned.filter((t: any) => t.endDate != null && dhakaDayKey(t.endDate) < today).length;

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
    workspace: `${t.project.key} • ${t.project.name}`,
    assignee: t.assignee?.name ?? "",
  });

  const detailLite = (t: any) => ({
    key: t.key,
    title: t.title,
    status: t.status,
    priority: t.priority,
    due: t.endDate ? new Date(t.endDate).toISOString().slice(0, 10) : "—",
    workspace: `${t.projectKey} • ${t.projectName}`,
    assignee: t.assigneeName ?? "",
  });

  function row(t: (typeof assigned)[number]) {
    return (
      <div key={t.id} style={{ height: ROW_H, flex: `0 0 ${ROW_H}px`, display: "flex", alignItems: "center", gap: 8, padding: "0 10px", overflow: "hidden" }} className={`rounded border border-line bg-surface ${TY.rowTitle}`}>
        <span className={`shrink-0 ${TY.rowId}`}>{taskKey(t.project.key, t.serial)}</span>
        <Link href={`/p/${t.projectId}/board?task=${t.id}`} className="min-w-0 flex-1 truncate hover:underline" style={{ minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {t.title}
        </Link>
        <span className={`shrink-0 rounded px-[5px] py-px sm:px-1.5 ${TY.badge}`} style={{ background: `${t.status.color}22`, color: t.status.color }}>{t.status.name}</span>
        <span className={`shrink-0 ${TY.badge}`} style={{ color: t.priority.color }}>● {t.priority.name}</span>
      </div>
    );
  }

  const { cards } = summary;
  /** Card subtitle: same denominator + clamp for every card, never >100%. */
  const pct = (n: number) => `${percentageOf(n, cards.all)}% of all`;

  return (
    <div>
      {/* Page heading: desktop only — on mobile the top bar carries the title. */}
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <ViewportSwitch
            desktop={
              <div className="vp-desktop-only flex items-center gap-2.5">
                <h1 className="tt-title">Dashboard</h1>
              </div>
            }
            mobile={null}
          />
          <p className={TY.pageSub}>
            Welcome back, {user.name} • {summary.projectCount} workspace{summary.projectCount === 1 ? "" : "s"} in view
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
          <span className={`rounded-full border px-2.5 py-1 ${TY.filter} ${user.isSuperAdmin ? "border-[rgba(237,194,17,0.45)] bg-[rgba(237,194,17,0.16)] text-[#111827] dark:text-[#EDC211]" : "border-line bg-surface text-muted"}`}>
            {roleLabel}
          </span>
        </div>
      </div>

      {/* KPI cards — exact board order. 2 compact columns on phones, 3 on
          tablets, 4 on desktop (the desktop card design is unchanged). Every
          number comes from the shared selector, so mobile and desktop agree. */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4">
        {([
          { label: "Total", value: cards.all, hint: pct(cards.all), icon: IconListChecks, tone: "indigo" },
          { label: "In Progress", value: cards.inProgress, hint: pct(cards.inProgress), icon: IconClock, tone: "sky" },
          { label: "Dev Done", value: cards.devDone, hint: pct(cards.devDone), icon: IconTrendUp, tone: "amber" },
          { label: "Testing", value: cards.testing, hint: pct(cards.testing), icon: IconClipboardCheck, tone: "violet" },
          { label: "Re-open", value: cards.reopen, hint: pct(cards.reopen), icon: IconHistory, tone: "slate" },
          { label: "Completed", value: cards.done, hint: pct(cards.done), icon: IconCheckCircle, tone: "emerald" },
          { label: "Due", value: cards.overdue, hint: cards.overdue > 0 ? "past the due date" : "nothing overdue", icon: IconWarning, tone: "red" },
          { label: "Unassigned", value: cards.unassigned, hint: pct(cards.unassigned), icon: IconUserMinus, tone: "slate", className: "sm:col-span-2 lg:col-span-1" },
        ] as const).map((k) => (
          <Kpi key={k.label} label={k.label} value={k.value} hint={k.hint} icon={<k.icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />} tone={k.tone} className={"className" in k ? k.className : ""} />
        ))}
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-4">
        <Card title="Completion & timers" icon={<IconTrendUp className="h-4 w-4 text-[#16A34A]" />}>
          <div className={`flex items-center justify-between ${TY.chart}`}>
            <span className="font-semibold text-[12px] leading-[1.35] sm:text-[12px] sm:leading-[1.4]">Completion rate</span>
            <span className="tabular-nums text-[12px] leading-[1.35] text-muted sm:text-[12px] sm:leading-[1.4]">{summary.completionPct}%</span>
          </div>
          <div
            className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-line sm:h-2"
            role="progressbar"
            aria-label="Completion rate"
            aria-valuenow={summary.completionPct}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div className="h-full rounded-full transition-all" style={{ width: `${summary.completionPct}%`, backgroundColor: "#16A34A" }} />
          </div>
          <div className={`mt-2 flex flex-wrap gap-x-3 gap-y-1 ${TY.small}`}>
            <span className="tabular-nums">{cards.done} of {cards.all} done</span>
            <span className="tabular-nums">• {cards.open} open</span>
          </div>
          <div className={`mt-1.5 flex flex-wrap gap-x-3 gap-y-1 ${TY.small}`}>
            <span className="inline-flex items-center gap-1 tabular-nums">
              <IconClock className="h-3 w-3" /> {summary.runningNow} timer{summary.runningNow === 1 ? "" : "s"} running
            </span>
            {summary.timerOverdue > 0 && (
              <span className="inline-flex items-center gap-1 tabular-nums text-[#EF4444]">
                <IconAlarmClock className="h-3 w-3" /> {summary.timerOverdue} timer overdue
              </span>
            )}
          </div>
        </Card>

        <Card title="Tasks by status" icon={<IconChart className="h-4 w-4 text-muted" />}>
          <div className="flex flex-col gap-1.5 sm:gap-1">
            {summary.byStatus.length === 0 && <Empty>No tasks yet.</Empty>}
            {summary.byStatus.map((s) => (
              <StatBar key={s.id} label={s.name} value={s.count} max={Math.max(1, ...summary.byStatus.map((x) => x.count))} color={s.color} />
            ))}
          </div>
        </Card>

        <Card title="Tasks by priority" icon={<IconChart className="h-4 w-4 text-muted" />}>
          <div className="flex flex-col gap-1.5 sm:gap-1">
            {summary.byPriority.length === 0 && <Empty>No tasks yet.</Empty>}
            {summary.byPriority.map((p) => (
              <StatBar key={p.name} label={p.name} value={p.count} max={Math.max(1, ...summary.byPriority.map((x) => x.count))} color={p.color} />
            ))}
          </div>
        </Card>

        <Card title="Open tasks per member" icon={<IconChart className="h-4 w-4 text-muted" />}>
          <div className="flex flex-col gap-1.5 sm:gap-1">
            {summary.perMember.length === 0 && <Empty>No open tasks.</Empty>}
            {summary.perMember.map((m) => (
              <StatBar key={m.userId} label={m.name} value={m.count} max={Math.max(1, ...summary.perMember.map((x) => x.count))} color="#708AF4" />
            ))}
          </div>
        </Card>
      </div>

      {accessibleProjects.length === 0 && (
        <p className={`mt-3 rounded border bg-surface p-4 border-line ${TY.small}`}>
          You are not a member of any project yet. Ask an administrator to add you.
        </p>
      )}

      {accessibleProjects.length > 0 && resolved.projectIds.length === 0 && (
        <p className={`mt-3 rounded border border-dashed border-line bg-surface p-4 ${TY.small}`}>
          No workspaces selected. Use the workspace filter to choose workspaces.
        </p>
      )}

      {accessibleProjects.length > 0 && resolved.projectIds.length > 0 && resolved.periods !== null && resolved.periods.length === 0 && (
        <p className={`mt-3 rounded border border-dashed border-line bg-surface p-4 ${TY.small}`}>
          No months or years selected. Use the Month and Year filters to choose a reporting period.
        </p>
      )}

      {accessibleProjects.length > 0 && resolved.projectIds.length > 0 && !(resolved.periods !== null && resolved.periods.length === 0) && (
        <div className="mt-3 grid items-start gap-3 md:grid-cols-2">
          <ListCard
            title={`Assigned (${assigned.length})`}
            icon={<IconListChecks className="h-4 w-4 text-muted" />}
            action={assignedOpen > 0 ? <>{assignedOpen} open{assignedOverdue > 0 ? ` • ${assignedOverdue} overdue` : ""}</> : undefined}
            itemCount={assigned.length}
            empty="Nothing assigned right now."
          >
            {assigned.map((t) => row(t))}
          </ListCard>
          <ListCard
            title={`Waiting for testing (${qaQueue.length})`}
            icon={<IconClipboardCheck className="h-4 w-4 text-muted" />}
            itemCount={qaQueue.length}
            empty="No task is waiting for testing."
          >
            {qaQueue.map((t) => row(t))}
          </ListCard>
          <ListCard
            title={`Overdue (${overdue.length})`}
            icon={<IconAlarmClock className="h-4 w-4 text-[#EF4444]" />}
            itemCount={overdue.length}
            empty="Nothing overdue — nice."
          >
            {overdue.map((t) => row(t))}
          </ListCard>
          <ListCard
            title="Recently changed"
            icon={<IconHistory className="h-4 w-4 text-muted" />}
            itemCount={recent.length}
            empty="No activity yet."
          >
            {recent.map((a) => (
              <div key={a.id} style={{ height: ROW_H, flex: `0 0 ${ROW_H}px`, display: "flex", alignItems: "center", gap: 8, padding: "0 10px", overflow: "hidden" }} className={`rounded border border-line bg-surface ${TY.recent}`}>
                <span className={`shrink-0 ${TY.rowId}`}>{taskKey(a.task.project.key, a.task.serial)}</span>
                <Link href={`/p/${a.task.projectId}/board?task=${a.taskId}`} className="min-w-0 flex-1 truncate hover:underline" style={{ minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.task.title}</Link>
                <span className={`shrink-0 truncate text-muted ${TY.badge}`} style={{ maxWidth: "40%" }}>— {a.actor?.name ?? "system"} • {activityLabel(a)}</span>
              </div>
            ))}
          </ListCard>
        </div>
      )}

      {accessibleProjects.length > 0 && (() => {
        const byNewest = (a: any, b: any) => {
          const da = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const db = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          if (db !== da) return db - da;
          return String(b.id).localeCompare(String(a.id));
        };
        const ongoing = accessibleProjects.filter((p: any) => !p.isCompleted).sort(byNewest);
        const completedWs = accessibleProjects.filter((p: any) => p.isCompleted).sort(byNewest);
        const chip = (p: any) => (
          <Link key={p.id} href={`/p/${p.id}/board`} className={`tt-card px-3 py-2 transition-shadow hover:shadow ${TY.chip}`}>
            <span className={TY.chipCode}>{p.key}</span> {p.name}
          </Link>
        );
        return (
          <div className="mt-3 grid items-stretch gap-3 md:grid-cols-2">
            <Card title="Workspaces" bodyClassName="h-[140px] overflow-y-auto scroll-thin overscroll-contain">
              {ongoing.length === 0 ? <Empty>No ongoing workspaces.</Empty> : <div className="flex flex-wrap gap-2">{ongoing.map(chip)}</div>}
            </Card>
            <Card title="Completed" bodyClassName="h-[140px] overflow-y-auto scroll-thin overscroll-contain">
              {completedWs.length === 0 ? <Empty>No completed workspaces.</Empty> : <div className="flex flex-wrap gap-2">{completedWs.map(chip)}</div>}
            </Card>
          </div>
        );
      })()}
    </div>
  );
}
