import type { PrismaClient } from "@prisma/client";
import { dayKey } from "./calendar";
import { deriveTimerState } from "./timerState";
import { inSelectedPeriods, type ResolvedDashboardFilters } from "./dashboardFilters";

/**
 * Dashboard aggregation with centralized, combined filters.
 * - Workspace scope: pre-resolved authorized projectIds.
 * - Periods: per-metric date fields (created/completed/due/updated/activity).
 * - Users: optional filter on assignee/tester (and unassigned) where applicable.
 * All filters are ANDed across dimensions; multi-select within a dimension is OR.
 */

export interface DashboardSummary {
  projectCount: number;
  totals: { all: number; open: number; done: number; pending: number; inProgress: number; overdue: number };
  completionPct: number;
  myOpen: number;
  myOverdue: number;
  runningNow: number;
  timerOverdue: number;
  byStatus: { id: string; name: string; color: string; count: number }[];
  byPriority: { name: string; color: string; count: number }[];
  perMember: { userId: string; name: string; count: number }[];
  /** Workspace-wise summary for reporting/exports. */
  byWorkspace: { projectId: string; key: string; name: string; total: number; done: number; open: number; overdue: number }[];
  /** User-wise task summary for reporting/exports. */
  byUser: { userId: string; name: string; total: number; done: number; open: number; overdue: number }[];
}

export interface DashboardTaskLite {
  id: string;
  key: string;
  serial: number;
  title: string;
  status: string;
  statusCategory: string;
  priority: string;
  projectId: string;
  projectKey: string;
  projectName: string;
  assigneeId: string | null;
  assigneeName: string | null;
  testedById: string | null;
  testedByName: string | null;
  createdAt: Date;
  updatedAt: Date;
  endDate: Date | null;
}

function isDoneCat(category: string) { return category === "done"; }

function isOverdue(endDate: Date | null, category: string, today: string) {
  return !isDoneCat(category) && endDate != null && dayKey(endDate) < today;
}

function taskMatchesUserFilter(
  t: { assigneeId: string | null; testedById: string | null },
  f: ResolvedDashboardFilters,
  mode: "assignee" | "assigneeOrTester" | "any",
): boolean {
  if (!f.hasUserFilter) return true;
  const ids = new Set(f.userIds);
  const matchId = (id: string | null) => (id == null ? f.includeUnassigned : ids.has(id));
  if (mode === "assignee") return matchId(t.assigneeId);
  if (mode === "assigneeOrTester") return matchId(t.assigneeId) || matchId(t.testedById);
  // any: assignee or tester or unassigned match
  return matchId(t.assigneeId) || (t.testedById != null && ids.has(t.testedById));
}

function periodAllows(date: Date | null | undefined, periods: string[] | null): boolean {
  return inSelectedPeriods(date ?? null, periods);
}

/**
 * Compute dashboard summary honoring combined filters.
 * Date-field rules per metric:
 * - Total (creation): task.createdAt in periods
 * - Completed: done tasks whose completion proxy (updatedAt, status done) in periods
 * - Overdue: not-done tasks whose due/endDate in periods and past due
 * - Distributions/lists/task details: tasks matching workspace+user filters and
 *   relevant to selected periods (createdAt or updatedAt or endDate in period) so
 *   the view is coherently scoped to the reporting window.
 * - Activity: activity.createdAt in periods
 */
export async function dashboardSummary(
  client: PrismaClient,
  viewerId: string,
  _isSuperAdmin: boolean,
  filters: ResolvedDashboardFilters,
): Promise<DashboardSummary> {
  const projectIds = filters.projectIds;
  const periods = filters.periods;
  const today = dayKey(new Date());
  const now = new Date();

  if (projectIds.length === 0) {
    return {
      projectCount: 0,
      totals: { all: 0, open: 0, done: 0, pending: 0, inProgress: 0, overdue: 0 },
      completionPct: 0, myOpen: 0, myOverdue: 0, runningNow: 0, timerOverdue: 0,
      byStatus: [], byPriority: [], perMember: [], byWorkspace: [], byUser: [],
    };
  }

  const tasks = await client.task.findMany({
    where: { projectId: { in: projectIds } },
    include: {
      status: { select: { id: true, name: true, color: true, category: true, timerRole: true } },
      priority: { select: { name: true, color: true } },
      assignee: { select: { id: true, name: true } },
      testedBy: { select: { id: true, name: true } },
      project: { select: { id: true, key: true, name: true } },
    },
  });

  // Apply user filter to the candidate set for user-scoped views; admins/PMs selecting users
  // narrow the dataset, regular users are already restricted by resolver.
  const userScoped = (t: (typeof tasks)[number]) => {
    if (!filters.hasUserFilter) return true;
    // include task if assignee or tester matches selection (or unassigned)
    return taskMatchesUserFilter(t, filters, "assigneeOrTester");
  };

  const inReportingWindow = (t: (typeof tasks)[number]) => {
    if (periods === null) return true;
    if (periods.length === 0) return false;
    return periodAllows(t.createdAt, periods) || periodAllows(t.updatedAt, periods) || periodAllows(t.endDate, periods);
  };

  const scoped = tasks.filter((t) => userScoped(t) && inReportingWindow(t));

  const totals = { all: 0, open: 0, done: 0, pending: 0, inProgress: 0, overdue: 0 };
  const byStatusMap = new Map<string, { id: string; name: string; color: string; count: number }>();
  const byPriorityMap = new Map<string, { name: string; color: string; count: number }>();
  const perMemberMap = new Map<string, { userId: string; name: string; count: number }>();
  const byWorkspaceMap = new Map<string, { projectId: string; key: string; name: string; total: number; done: number; open: number; overdue: number }>();
  const byUserMap = new Map<string, { userId: string; name: string; total: number; done: number; open: number; overdue: number }>();

  let myOpen = 0;
  let myOverdue = 0;
  let runningNow = 0;
  let timerOverdue = 0;

  for (const t of scoped) {
    const done = isDoneCat(t.status.category);
    const overdue = isOverdue(t.endDate, t.status.category, today);

    // Per-metric period counts
    const createdIn = periodAllows(t.createdAt, periods);
    const completedIn = done && periodAllows(t.updatedAt, periods); // proxy: done + updated in period
    const dueIn = periodAllows(t.endDate, periods);

    if (createdIn) totals.all += 1;
    if (completedIn) totals.done += 1;
    if (!done && createdIn) { // open portion of created-in-period (approx for coherence)
      totals.open += 1;
      if (t.status.category === "inprogress") totals.inProgress += 1;
      else if (t.status.category === "todo") totals.pending += 1;
    }
    if (overdue && dueIn) totals.overdue += 1;

    // Personal (viewer) counters within scoped set
    if (t.assigneeId === viewerId && !done) {
      myOpen += 1;
      if (overdue) myOverdue += 1;
    }

    const timerState = deriveTimerState({ ...t, statusRole: t.status.timerRole } as any, now);
    if (timerState === "running") runningNow += 1;
    else if (timerState === "overdue") timerOverdue += 1;

    const s = byStatusMap.get(t.status.name) ?? { id: t.status.name, name: t.status.name, color: t.status.color, count: 0 };
    s.count += 1;
    byStatusMap.set(t.status.name, s);

    const p = byPriorityMap.get(t.priority.name) ?? { name: t.priority.name, color: t.priority.color, count: 0 };
    p.count += 1;
    byPriorityMap.set(t.priority.name, p);

    if (!done) {
      const key = t.assigneeId ?? "none";
      const m = perMemberMap.get(key) ?? { userId: key, name: t.assignee?.name ?? "(unassigned)", count: 0 };
      m.count += 1;
      perMemberMap.set(key, m);
    }

    const ws = byWorkspaceMap.get(t.projectId) ?? { projectId: t.projectId, key: t.project.key, name: t.project.name, total: 0, done: 0, open: 0, overdue: 0 };
    ws.total += 1; if (done) ws.done += 1; else ws.open += 1; if (overdue) ws.overdue += 1;
    byWorkspaceMap.set(t.projectId, ws);

    const ukey = t.assigneeId ?? "none";
    const uname = t.assignee?.name ?? "(unassigned)";
    const us = byUserMap.get(ukey) ?? { userId: ukey, name: uname, total: 0, done: 0, open: 0, overdue: 0 };
    us.total += 1; if (done) us.done += 1; else us.open += 1; if (overdue) us.overdue += 1;
    byUserMap.set(ukey, us);
  }

  // If no period filter, totals.all/open/done/inProgress/pending/overdue above were counted only when createdIn/completedIn/dueIn
  // which all return true when periods empty -> correct. completionPct based on totals.
  const completionPct = totals.all === 0 ? 0 : Math.round((totals.done / Math.max(1, totals.all)) * 100);

  return {
    projectCount: filters.projects.length,
    totals,
    completionPct,
    myOpen,
    myOverdue,
    runningNow,
    timerOverdue,
    byStatus: [...byStatusMap.values()].sort((a, b) => b.count - a.count),
    byPriority: [...byPriorityMap.values()].sort((a, b) => b.count - a.count),
    perMember: [...perMemberMap.values()].sort((a, b) => b.count - a.count),
    byWorkspace: [...byWorkspaceMap.values()].sort((a, b) => a.key.localeCompare(b.key)),
    byUser: [...byUserMap.values()].sort((a, b) => b.total - a.total),
  };
}

export interface DashboardListsResult {
  assigned: any[];
  qaQueue: any[];
  overdue: any[];
  recent: any[];
  /** Full filtered task details for exports (relevant task details). */
  taskDetails: DashboardTaskLite[];
}

/**
 * Lists for dashboard sections + export task details, with same combined filters.
 */
export async function dashboardLists(
  client: PrismaClient,
  viewerId: string,
  filters: ResolvedDashboardFilters,
): Promise<DashboardListsResult> {
  const projectIds = filters.projectIds;
  const periods = filters.periods;
  const today = dayKey(new Date());
  const empty = { assigned: [], qaQueue: [], overdue: [], recent: [], taskDetails: [] as DashboardTaskLite[] };
  if (projectIds.length === 0) return empty;

  // Determine "personal" target users for Assigned/QA lists:
  // - if user filter selects specific users -> show for those users
  // - else default to viewer (preserves "Assigned to me" / "Waiting for my testing")
  // Regular users are restricted by resolver to self.
  const targetUserIds = filters.hasUserFilter && filters.userIds.length > 0 ? filters.userIds : [viewerId];

  // Base task query for details/lists: workspace + reporting window relevance
  const tasks = await client.task.findMany({
    where: { projectId: { in: projectIds } },
    include: {
      status: { select: { id: true, name: true, color: true, category: true } },
      priority: { select: { name: true, color: true } },
      assignee: { select: { id: true, name: true } },
      testedBy: { select: { id: true, name: true } },
      project: { select: { id: true, key: true, name: true } },
    },
  });

  const userScoped = (t: (typeof tasks)[number]) => {
    if (!filters.hasUserFilter) return true;
    return taskMatchesUserFilter(t, filters, "assigneeOrTester");
  };
  const inReportingWindow = (t: (typeof tasks)[number]) => {
    if (periods === null) return true;
    if (periods.length === 0) return false;
    return periodAllows(t.createdAt, periods) || periodAllows(t.updatedAt, periods) || periodAllows(t.endDate, periods);
  };
  const scoped = tasks.filter((t) => userScoped(t) && inReportingWindow(t));

  const lite = (t: (typeof tasks)[number]): DashboardTaskLite => ({
    id: t.id,
    key: `${t.project.key}-${t.serial}`,
    serial: t.serial,
    title: t.title,
    status: t.status.name,
    statusCategory: t.status.category,
    priority: t.priority.name,
    projectId: t.projectId,
    projectKey: t.project.key,
    projectName: t.project.name,
    assigneeId: t.assigneeId,
    assigneeName: t.assignee?.name ?? null,
    testedById: t.testedById,
    testedByName: t.testedBy?.name ?? null,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    endDate: t.endDate,
  });

  const assigned = scoped
    .filter((t) => t.assigneeId != null && targetUserIds.includes(t.assigneeId) && !isDoneCat(t.status.category))
    .sort((a, b) => (a.endDate?.getTime() ?? Infinity) - (b.endDate?.getTime() ?? Infinity))
    .slice(0, 50);

  const qaQueue = scoped
    .filter((t) => t.testedById != null && targetUserIds.includes(t.testedById) && t.status.name === "In Testing")
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
    .slice(0, 50);

  const overdue = scoped
    .filter((t) => {
      if (!isOverdue(t.endDate, t.status.category, today)) return false;
      // overdue reporting by due date in periods
      if (!periodAllows(t.endDate, periods)) return false;
      // relevant to selected users or viewer involvement
      const involved = t.assigneeId != null && targetUserIds.includes(t.assigneeId)
        || t.testedById != null && targetUserIds.includes(t.testedById);
      return filters.hasUserFilter ? involved : involved;
    })
    .sort((a, b) => (a.endDate?.getTime() ?? 0) - (b.endDate?.getTime() ?? 0))
    .slice(0, 50);

  // Recent activity filtered by updated/activity date in periods
  const recentWhere: any = { task: { projectId: { in: projectIds } } };
  if (filters.periodRange) {
    recentWhere.createdAt = { gte: filters.periodRange.start, lte: filters.periodRange.end };
  }
  // If user filter active, prefer activities on tasks involving selected users (best-effort)
  if (filters.hasUserFilter) {
    const or: any[] = [];
    if (filters.userIds.length > 0) {
      or.push({ task: { assigneeId: { in: filters.userIds } } });
      or.push({ task: { testedById: { in: filters.userIds } } });
      or.push({ actorId: { in: filters.userIds } });
    }
    if (filters.includeUnassigned) {
      or.push({ task: { assigneeId: null } });
    }
    if (or.length > 0) recentWhere.AND = [{ OR: or }];
  }

  const recent = await client.activity.findMany({
    where: recentWhere,
    include: { task: { include: { project: true } }, actor: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  // Resolve assignment names for activity labels (same as before)
  const assignIds = new Set<string>();
  for (const a of recent) {
    if (a.action === "task.assigned" || (a.action === "task.updated" && a.field === "assigneeId")) {
      if (a.after) assignIds.add(a.after);
    }
  }
  const assignUsers = assignIds.size > 0
    ? await client.user.findMany({ where: { id: { in: [...assignIds] } }, select: { id: true, name: true, deletedAt: true } })
    : [];
  const assignNames = new Map(assignUsers.map((u) => [u.id, u.deletedAt ? `${u.name} (removed)` : u.name]));
  const recentOut = recent.map((a) =>
    a.action === "task.assigned" || (a.action === "task.updated" && a.field === "assigneeId")
      ? { ...a, afterName: a.after ? assignNames.get(a.after) ?? null : null }
      : a,
  );

  const taskDetails = scoped
    .map(lite)
    .sort((a, b) => a.projectKey.localeCompare(b.projectKey) || a.serial - b.serial);

  return { assigned, qaQueue, overdue, recent: recentOut, taskDetails };
}