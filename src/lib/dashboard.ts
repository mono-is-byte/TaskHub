import type { PrismaClient } from "@prisma/client";
import { deriveTimerState } from "./timerState";
import type { ResolvedDashboardFilters } from "./dashboardFilters";

type StatusBucket = "todo" | "in_progress" | "dev_done" | "testing" | "reopen" | "done";

const STATUS_ORDER: StatusBucket[] = ["todo", "in_progress", "dev_done", "testing", "reopen", "done"];

const STATUS_BUCKET_META: Record<StatusBucket, { label: string; color: string }> = {
  todo: { label: "To Do", color: "#64748b" },
  in_progress: { label: "In Progress", color: "#3b82f6" },
  dev_done: { label: "Development Done", color: "#f59e0b" },
  testing: { label: "In Testing", color: "#a855f7" },
  reopen: { label: "Re-open", color: "#ef4444" },
  done: { label: "Done", color: "#22c55e" },
};

const NAME_ALIASES: Record<string, StatusBucket> = {
  "to do": "todo",
  todo: "todo",
  "in progress": "in_progress",
  inprogress: "in_progress",
  "development done": "dev_done",
  "dev done": "dev_done",
  "in testing": "testing",
  testing: "testing",
  "re-open": "reopen",
  reopen: "reopen",
  "re open": "reopen",
  done: "done",
};

function statusBucketOf(status: { name: string; category?: string | null }): StatusBucket {
  const normalized = status.name.trim().toLowerCase().replace(/\s+/g, " ");
  const alias = NAME_ALIASES[normalized];
  if (alias) return alias;
  const category = (status.category ?? "").toLowerCase();
  if (category === "done") return "done";
  if (category === "todo") return "todo";
  return "in_progress";
}

function isInvolved(task: { assigneeId?: string | null; testedById?: string | null }, userId: string): boolean {
  return (task.assigneeId ?? null) === userId || (task.testedById ?? null) === userId;
}

export function isFullyUnassigned(task: { assigneeId?: string | null; testedById?: string | null }): boolean {
  return (task.assigneeId ?? null) == null && (task.testedById ?? null) == null;
}

const DHAKA_FORMAT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Dhaka",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function dhakaDayKey(date: Date | string): string {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  const parts = DHAKA_FORMAT.formatToParts(d);
  const year = parts.find((p) => p.type === "year")?.value ?? "";
  const month = parts.find((p) => p.type === "month")?.value ?? "";
  const day = parts.find((p) => p.type === "day")?.value ?? "";
  return year && month && day ? `${year}-${month}-${day}` : "";
}

export function todayDhaka(now: Date = new Date()): string {
  return dhakaDayKey(now);
}

export function percentageOf(count: number, all: number): number {
  if (!Number.isFinite(count) || !Number.isFinite(all) || all <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((count / all) * 100)));
}

type CountableTask = {
  statusId?: string | null;
  status: { id?: string; name: string; category?: string | null; color?: string | null };
  assigneeId?: string | null;
  testedById?: string | null;
  endDate?: Date | string | null;
};

function selectDashboardTasks<T extends CountableTask>(
  tasks: readonly T[],
  viewer: { id: string; canSeeAll?: boolean },
  filters: { userIds?: string[]; includeUnassigned?: boolean } = {},
): T[] {
  const userIds = filters.userIds ?? [];
  const includeUnassigned = filters.includeUnassigned === true;
  const userFilterActive = userIds.length > 0 || includeUnassigned;
  return tasks.filter((t) => {
    if (!viewer.canSeeAll && !isInvolved(t, viewer.id)) return false;
    if (userFilterActive) {
      const byUser = userIds.some((id) => isInvolved(t, id));
      const unassigned = includeUnassigned && (t.assigneeId ?? null) === null;
      if (!byUser && !unassigned) return false;
    }
    return true;
  });
}

function computeDashboardCounts<T extends CountableTask>(
  tasks: readonly T[],
  viewer: { id: string; canSeeAll?: boolean },
  filters: { userIds?: string[]; includeUnassigned?: boolean; today?: string } = {},
) {
  const selected = selectDashboardTasks(tasks, viewer, filters);
  const today = filters.today ?? todayDhaka();
  const counts: Record<StatusBucket, number> = {
    todo: 0, in_progress: 0, dev_done: 0, testing: 0, reopen: 0, done: 0,
  };
  let overdue = 0;
  for (const task of selected) {
    const bucket = statusBucketOf(task.status);
    counts[bucket] += 1;
    if (bucket !== "done" && task.endDate != null) {
      const due = dhakaDayKey(task.endDate);
      if (due && due < today) overdue += 1;
    }
  }
  const all = STATUS_ORDER.reduce((sum, key) => sum + counts[key], 0);
  const done = counts.done;
  return {
    counts,
    all,
    done,
    open: Math.max(0, all - done),
    overdue,
    completionPct: percentageOf(done, all),
    tasks: selected,
  };
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

export interface DashboardListsResult {
  assigned: any[];
  qaQueue: any[];
  overdue: any[];
  recent: any[];
  taskDetails: DashboardTaskLite[];
}

export interface DashboardSummary {
  projectCount: number;
  totals: { all: number; open: number; done: number; pending: number; inProgress: number; overdue: number };
  completionPct: number;
  cards: {
    todo: number;
    inProgress: number;
    devDone: number;
    testing: number;
    reopen: number;
    done: number;
    all: number;
    open: number;
    overdue: number;
    unassigned: number;
    completionPct: number;
  };
  myOpen: number;
  myOverdue: number;
  runningNow: number;
  timerOverdue: number;
  byStatus: { id: string; name: string; color: string; count: number }[];
  byPriority: { name: string; color: string; count: number }[];
  perMember: { userId: string; name: string; count: number }[];
  byWorkspace: { projectId: string; key: string; name: string; total: number; done: number; open: number; overdue: number }[];
  byUser: { userId: string; name: string; total: number; done: number; open: number; overdue: number }[];
  lists: DashboardListsResult;
}

function emptySummary(): DashboardSummary {
  return {
    projectCount: 0,
    totals: { all: 0, open: 0, done: 0, pending: 0, inProgress: 0, overdue: 0 },
    completionPct: 0,
    cards: { todo: 0, inProgress: 0, devDone: 0, testing: 0, reopen: 0, done: 0, all: 0, open: 0, overdue: 0, unassigned: 0, completionPct: 0 },
    myOpen: 0, myOverdue: 0, runningNow: 0, timerOverdue: 0,
    byStatus: [], byPriority: [], perMember: [], byWorkspace: [], byUser: [],
    lists: { assigned: [], qaQueue: [], overdue: [], recent: [], taskDetails: [] },
  };
}



export async function dashboardSummary(
  client: PrismaClient,
  viewerId: string,
  isSuperAdmin: boolean,
  filters: ResolvedDashboardFilters,
): Promise<DashboardSummary> {
  const projectIds = filters.projectIds;
  const now = new Date();
  const today = todayDhaka(now);

  if (projectIds.length === 0) return emptySummary();

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

  const board = computeDashboardCounts(
    tasks,
    { id: viewerId, canSeeAll: filters.viewerCanSeeAll ?? isSuperAdmin },
    {
      userIds: filters.hasUserFilter ? filters.userIds : [],
      includeUnassigned: filters.hasUserFilter ? filters.includeUnassigned : false,
    },
  );
  const scoped = board.tasks;

  const byPriorityMap = new Map<string, { name: string; color: string; count: number }>();
  const perMemberMap = new Map<string, { userId: string; name: string; count: number }>();
  const byWorkspaceMap = new Map<string, { projectId: string; key: string; name: string; total: number; done: number; open: number; overdue: number }>();
  const byUserMap = new Map<string, { userId: string; name: string; total: number; done: number; open: number; overdue: number }>();
  const statusMeta = new Map<StatusBucket, { name: string; color: string }>();

  let myOpen = 0;
  let myOverdue = 0;
  let runningNow = 0;
  let timerOverdue = 0;
  let unassignedOpen = 0;

  for (const t of scoped) {
    const bucket = statusBucketOf(t.status);
    const done = bucket === "done";
    const due = t.endDate != null ? dhakaDayKey(t.endDate) : "";
    const overdue = !done && due !== "" && due < today;
    if (!statusMeta.has(bucket)) statusMeta.set(bucket, { name: t.status.name, color: t.status.color ?? STATUS_BUCKET_META[bucket].color });

    if (t.assigneeId === viewerId && !done) {
      myOpen += 1;
      if (overdue) myOverdue += 1;
    }

    const timerState = deriveTimerState({ ...t, statusRole: t.status.timerRole } as any, now);
    if (timerState === "running") runningNow += 1;
    else if (timerState === "overdue") timerOverdue += 1;

    const p = byPriorityMap.get(t.priority.name) ?? { name: t.priority.name, color: t.priority.color, count: 0 };
    p.count += 1;
    byPriorityMap.set(t.priority.name, p);

    if (!done) {
      if (isFullyUnassigned(t)) {
        unassignedOpen += 1;
        const key = "none";
        const m = perMemberMap.get(key) ?? { userId: key, name: "(unassigned)", count: 0 };
        m.count += 1;
        perMemberMap.set(key, m);
      } else {
        const key = t.assigneeId ?? t.testedById ?? "none";
        const name = t.assignee?.name ?? t.testedBy?.name ?? "(unassigned)";
        const m = perMemberMap.get(key) ?? { userId: key, name, count: 0 };
        m.count += 1;
        perMemberMap.set(key, m);
      }
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

  const byStatus = STATUS_ORDER.map((key) => ({
    id: key,
    name: statusMeta.get(key)?.name ?? STATUS_BUCKET_META[key].label,
    color: statusMeta.get(key)?.color ?? STATUS_BUCKET_META[key].color,
    count: board.counts[key],
  }));

  const totals = {
    all: board.all,
    open: board.open,
    done: board.done,
    pending: board.counts.todo,
    inProgress: board.counts.in_progress,
    overdue: board.overdue,
  };

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

  const hasUserFilter = filters.hasUserFilter === true;
  const targetUserIds = filters.userIds ?? [];
  const matchesTargetUser = (t: { assigneeId: string | null; testedById: string | null }) => {
    if (!hasUserFilter) return true;
    const byUser = targetUserIds.length > 0
      && ((t.assigneeId != null && targetUserIds.includes(t.assigneeId))
        || (t.testedById != null && targetUserIds.includes(t.testedById)));
    const unassigned = filters.includeUnassigned === true && (t.assigneeId ?? null) === null;
    return byUser || unassigned;
  };

  const assigned = scoped
    .filter((t) => statusBucketOf(t.status) === "todo")
    .sort((a, b) => (a.endDate?.getTime() ?? Infinity) - (b.endDate?.getTime() ?? Infinity))
    .slice(0, 50);
  const qaQueue = scoped
    .filter((t) => statusBucketOf(t.status) === "testing" && matchesTargetUser(t))
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
    .slice(0, 50);
  const overdueList = scoped
    .filter((t) => {
      if (statusBucketOf(t.status) === "done") return false;
      if (t.endDate == null || dhakaDayKey(t.endDate) >= today) return false;
      return matchesTargetUser(t);
    })
    .sort((a, b) => (a.endDate?.getTime() ?? 0) - (b.endDate?.getTime() ?? 0))
    .slice(0, 50);

  const recentWhere: any = { task: { projectId: { in: projectIds } } };
  if (filters.periodRange) {
    recentWhere.createdAt = { gte: filters.periodRange.start, lte: filters.periodRange.end };
  }
  if (filters.hasUserFilter) {
    const or: any[] = [];
    if (filters.userIds.length > 0) {
      or.push({ task: { assigneeId: { in: filters.userIds } } });
      or.push({ task: { testedById: { in: filters.userIds } } });
      or.push({ actorId: { in: filters.userIds } });
    }
    if (filters.includeUnassigned) or.push({ task: { assigneeId: null } });
    if (or.length > 0) recentWhere.AND = [{ OR: or }];
  }
  const recent = await client.activity.findMany({
    where: recentWhere,
    include: { task: { include: { project: true } }, actor: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
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
  const taskDetails = scoped.map(lite).sort((a, b) => a.projectKey.localeCompare(b.projectKey) || a.serial - b.serial);

  return {
    projectCount: filters.projects.length,
    totals,
    completionPct: board.completionPct,
    cards: {
      todo: board.counts.todo,
      inProgress: board.counts.in_progress,
      devDone: board.counts.dev_done,
      testing: board.counts.testing,
      reopen: board.counts.reopen,
      done: board.counts.done,
      all: board.all,
      open: board.open,
      overdue: board.overdue,
      unassigned: unassignedOpen,
      completionPct: board.completionPct,
    },
    myOpen,
    myOverdue,
    runningNow,
    timerOverdue,
    byStatus,
    byPriority: [...byPriorityMap.values()].sort((a, b) => b.count - a.count),
    perMember: [...perMemberMap.values()].sort((a, b) => b.count - a.count),
    byWorkspace: [...byWorkspaceMap.values()].sort((a, b) => a.key.localeCompare(b.key)),
    byUser: [...byUserMap.values()].sort((a, b) => b.total - a.total),
    lists: { assigned, qaQueue, overdue: overdueList, recent: recentOut, taskDetails },
  };
}
