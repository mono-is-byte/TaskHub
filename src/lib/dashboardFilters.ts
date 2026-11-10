import type { PrismaClient } from "@prisma/client";
import { listProjectsForUser } from "./server";

export interface DashboardFilterState {
  /**
   * Workspace selection source-of-truth.
   * - null  => default "All Workspaces" (all accessible, resolved server-side)
   * - []    => explicit clear / none selected
   * - [ids] => selected workspace ids
   */
  workspaceIds: string[] | null;
  /** Selected month numbers (1-12). null/absent => default current month (resolved). */
  months: number[] | null;
  /** Selected years. null/absent => default current year (resolved). */
  years: number[] | null;
  /** User ids to filter by. Empty array means "all users" in scope (no user filter). */
  userIds: string[];
  /** Whether "Unassigned" is included in user filter. */
  includeUnassigned: boolean;
}

export interface ResolvedDashboardFilters {
  /** Authorized project ids in scope for task/data queries (may include hidden-member projects). */
  projectIds: string[];
  /** Projects included for counts/labels/export summaries (visible/selectable in scope). */
  projects: { id: string; key: string; name: string; isCompleted: boolean }[];
  /** Selected/authorized user ids (excluding unassigned token). */
  userIds: string[];
  includeUnassigned: boolean;
  /** If true, apply user filter to task/user-scoped metrics and lists. */
  hasUserFilter: boolean;
  /** Effective YYYY-MM periods (Cartesian months×years). null = all periods/no restriction. [] = none selected. */
  periods: string[] | null;
  /** Date range covering all selected periods (local), or null if unrestricted/none. */
  periodRange: { start: Date; end: Date } | null;
  /** Resolved selections for UI/export labels. null = all. [] = none selected. */
  selectedMonths: number[] | null;
  selectedYears: number[] | null;
  workspaceLabel: string;
  periodLabel: string;
  userLabel: string;
  /** Viewer context */
  viewerId: string;
  isAdmin: boolean;
  isPmScoped: boolean;
}

export interface DashboardViewer {
  id: string;
  isSuperAdmin: boolean;
}

function uniq<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}

const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];

export function getMonthRange(period: string): { start: Date; end: Date } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(period);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  if (!Number.isFinite(y) || mo < 1 || mo > 12) return null;
  const start = new Date(y, mo - 1, 1, 0, 0, 0, 0);
  const end = new Date(y, mo, 0, 23, 59, 59, 999); // last day of month
  return { start, end };
}

export function getPeriodsRange(periods: string[]): { start: Date; end: Date } | null {
  const ranges = periods.map(getMonthRange).filter((r): r is { start: Date; end: Date } => !!r);
  if (ranges.length === 0) return null;
  let start = ranges[0].start;
  let end = ranges[0].end;
  for (const r of ranges) {
    if (r.start < start) start = r.start;
    if (r.end > end) end = r.end;
  }
  return { start, end };
}

export function formatPeriod(period: string): string {
  const r = getMonthRange(period);
  if (!r) return period;
  return r.start.toLocaleString("en-US", { month: "long", year: "numeric" });
}

export function currentPeriod(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function currentMonth(): number { return new Date().getMonth() + 1; }
export function currentYear(): number { return new Date().getFullYear(); }

export function defaultFilterState(): DashboardFilterState {
  return {
    workspaceIds: null, // default: ongoing workspaces
    months: [currentMonth()],
    years: [currentYear()],
    userIds: [],
    includeUnassigned: false,
  };
}

/** Parse search params into filter state. Supports repeated params and comma-separated. */
export function parseDashboardFilters(sp: Record<string, string | string[] | undefined>): DashboardFilterState {
  const getAll = (key: string): string[] => {
    const v = sp[key];
    if (v == null) return [];
    const arr = Array.isArray(v) ? v : [v];
    return arr.flatMap((s) => s.split(",")).map((s) => s.trim()).filter(Boolean);
  };
  const getOne = (key: string): string => {
    const v = sp[key];
    if (Array.isArray(v)) return v[0] ?? "";
    return v ?? "";
  };

  // Workspaces: source of truth is selected ids. absent => default all (null). "none" => explicit clear.
  const wsParams = getAll("ws");
  const legacyProject = getOne("project");
  let workspaceIds: string[] | null = null;
  if (wsParams.length > 0) {
    if (wsParams.includes("none")) {
      workspaceIds = [];
    } else {
      // ignore legacy mode tokens if present; treat remaining as ids
      const ids = wsParams.filter((t) => t !== "all" && t !== "ongoing" && t !== "completed" && t !== "none");
      workspaceIds = uniq(ids);
      // if only legacy tokens were provided (old URLs), fall back to default-all and let resolver/UI handle? better map tokens:
      if (ids.length === 0) {
        // old-style: ws=ongoing/completed/all -> interpret as default-all for parse, resolver will need context; keep null
        workspaceIds = null;
      }
    }
  } else if (legacyProject) {
    workspaceIds = [legacyProject];
  }

  // Months/Years (new). Backward compat: accept legacy `period=YYYY-MM` / `period=all`.
  // Sentinels in state: null => absent/default (resolved to current), [-1] => all, [] => none/cleared.
  const monthParams = getAll("month");
  const yearParams = getAll("year");
  const periodParams = getAll("period");

  let months: number[] | null;
  let years: number[] | null;
  const parseNums = (vals: string[], min: number, max: number) =>
    uniq(vals.map((v) => Number(v)).filter((n) => Number.isInteger(n) && n >= min && n <= max));

  if (monthParams.length > 0 || yearParams.length > 0) {
    if (monthParams.length === 0) months = null; // absent -> default current
    else if (monthParams.includes("all")) months = [-1];
    else if (monthParams.includes("none")) months = [];
    else {
      const m = parseNums(monthParams, 1, 12);
      months = m.length ? m : [];
    }
    if (yearParams.length === 0) years = null;
    else if (yearParams.includes("all")) years = [-1];
    else if (yearParams.includes("none")) years = [];
    else {
      const y = parseNums(yearParams, 1970, 2100);
      years = y.length ? y : [];
    }
  } else if (periodParams.length > 0) {
    if (periodParams.includes("all")) {
      months = [-1]; years = [-1];
    } else {
      const ps = uniq(periodParams.filter((p) => /^\d{4}-\d{2}$/.test(p)));
      if (ps.length === 0) { months = null; years = null; }
      else {
        months = uniq(ps.map((p) => Number(p.slice(5, 7))).filter((n) => n >= 1 && n <= 12));
        years = uniq(ps.map((p) => Number(p.slice(0, 4))));
        if (!months.length) months = null;
        if (!years.length) years = null;
      }
    }
  } else {
    months = null;
    years = null;
  }

  // Users
  const userParams = getAll("user");
  const explicitNone = userParams.includes("__none");
  const includeUnassigned = !explicitNone && userParams.includes("unassigned");
  const userIds = explicitNone ? [] : uniq(userParams.filter((u) => u !== "unassigned" && u !== "__none"));

  return { workspaceIds, months, years, userIds, includeUnassigned, explicitUserNone: explicitNone } as DashboardFilterState & { explicitUserNone?: boolean };
}

/** Build a query string from filter state (canonical). */
export function dashboardFilterQuery(state: DashboardFilterState): string {
  const sp = new URLSearchParams();
  if (state.workspaceIds === null) {
    // default all
  } else if (state.workspaceIds.length === 0) {
    sp.append("ws", "none");
  } else {
    for (const id of state.workspaceIds) sp.append("ws", id);
  }
  if (state.months === null) { /* default */ }
  else if (state.months.length === 1 && state.months[0] === -1) sp.append("month", "all");
  else if (state.months.length === 0) sp.append("month", "none");
  else for (const m of state.months) sp.append("month", String(m));
  if (state.years === null) { /* default */ }
  else if (state.years.length === 1 && state.years[0] === -1) sp.append("year", "all");
  else if (state.years.length === 0) sp.append("year", "none");
  else for (const y of state.years) sp.append("year", String(y));
  for (const u of state.userIds) sp.append("user", u);
  if (state.includeUnassigned) sp.append("user", "unassigned");
  const qs = sp.toString();
  return qs ? `/?${qs}` : "/";
}

/**
 * Resolve filters against the database with server-side authorization.
 * - Workspaces: only projects the viewer can access (listProjectsForUser).
 * - Users: Admin can select any non-deleted user in scope; PM can select users in their managed workspaces;
 *   Regular users can only select themselves (or have no user filter -> treated as self for personal lists).
 */
export async function resolveDashboardFilters(
  client: PrismaClient,
  viewer: DashboardViewer,
  state: DashboardFilterState,
): Promise<ResolvedDashboardFilters> {
  // Visible/selectable workspaces (hidden excluded from picker/count by default)
  const accessible = await listProjectsForUser(viewer.id, viewer.isSuperAdmin, false, client);
  const accessibleIds = new Set(accessible.map((p) => p.id));

  let selectedProjects = accessible;
  if (state.workspaceIds === null) {
    selectedProjects = accessible.filter((p) => !p.isCompleted); // default: ongoing workspaces
  } else if (state.workspaceIds.length === 0) {
    selectedProjects = []; // explicit clear
  } else {
    const wanted = new Set(state.workspaceIds.filter((id) => accessibleIds.has(id)));
    selectedProjects = accessible.filter((p) => wanted.has(p.id));
  }

  const projects = selectedProjects.map((p) => ({ id: p.id, key: p.key, name: p.name, isCompleted: !!p.isCompleted }));
  // Task scope: include hidden projects the viewer belongs to in default ongoing scope (non-completed)
  // to preserve task visibility; for explicit selections use the selected authorized ids.
  let taskProjectIds = projects.map((p) => p.id);
  if (state.workspaceIds === null) {
    const allForTasks = await listProjectsForUser(viewer.id, viewer.isSuperAdmin, true, client);
    const selectedIdSet = new Set(taskProjectIds);
    for (const p of allForTasks) {
      if (!selectedIdSet.has(p.id) && p.isHidden && !p.isCompleted) taskProjectIds.push(p.id);
    }
  } else if (state.workspaceIds.length > 0) {
    const allForTasks = await listProjectsForUser(viewer.id, viewer.isSuperAdmin, true, client);
    const authIds = new Set(allForTasks.map((p) => p.id));
    taskProjectIds = uniq(state.workspaceIds.filter((id) => authIds.has(id)));
  } else {
    taskProjectIds = [];
  }

  const projectIds = uniq(taskProjectIds);

  // Determine if viewer is PM-scoped (has manage_members somewhere) for user filter scope
  let isPmScoped = false;
  let managedProjectIds: string[] = [];
  if (!viewer.isSuperAdmin) {
    const memberships = await client.projectMember.findMany({
      where: { userId: viewer.id },
      include: { roles: { include: { role: true } } },
    });
    // reuse merge logic inline-light: check manage_members in perms JSON
    for (const m of memberships) {
      for (const l of m.roles) {
        try {
          const perms = JSON.parse(l.role.permissions || "{}") as Record<string, boolean>;
          if (perms.manage_members === true) { managedProjectIds.push(m.projectId); break; }
        } catch { /* ignore */ }
      }
    }
    managedProjectIds = uniq(managedProjectIds);
    isPmScoped = managedProjectIds.length > 0;
  }

  // Resolve allowed user ids for filtering
  let allowedUserIds: Set<string> | null = null; // null = all (admin) in effect, but we still validate
  if (viewer.isSuperAdmin) {
    allowedUserIds = null;
  } else if (isPmScoped) {
    const members = await client.projectMember.findMany({
      where: { projectId: { in: managedProjectIds } },
      select: { userId: true },
      distinct: ["userId"],
    });
    allowedUserIds = new Set(members.map((m) => m.userId));
    allowedUserIds.add(viewer.id);
  } else {
    allowedUserIds = new Set([viewer.id]); // regular user: only self
  }

  const explicitUserNone = !!(state as any).explicitUserNone;
  const requestedUsers = uniq(state.userIds);
  let userIds: string[] = [];
  let includeUnassigned = false;
  if (explicitUserNone) {
    userIds = [];
    includeUnassigned = false;
  } else if (viewer.isSuperAdmin) {
    if (requestedUsers.length > 0) {
      const rows = await client.user.findMany({ where: { id: { in: requestedUsers }, deletedAt: null }, select: { id: true } });
      const valid = new Set(rows.map((r) => r.id));
      userIds = requestedUsers.filter((id) => valid.has(id));
    }
    includeUnassigned = state.includeUnassigned;
  } else if (isPmScoped) {
    userIds = requestedUsers.filter((id) => allowedUserIds!.has(id));
    includeUnassigned = state.includeUnassigned; // PM may include unassigned in scope
  } else {
    // Regular user: only their own permitted personal information
    if (requestedUsers.includes(viewer.id) || requestedUsers.length === 0) {
      // no explicit filter or self requested -> treat as "self" scope for personal sections via hasUserFilter logic below
      // but to keep "Assigned to me" working as before, don't force filter unless explicitly requested
    }
    userIds = requestedUsers.filter((id) => id === viewer.id);
    includeUnassigned = false;
  }

  const hasUserFilter = explicitUserNone || userIds.length > 0 || includeUnassigned;

  // Months/Years -> effective periods (Cartesian). Sentinel [-1] means "all".
  const monthsAll = !!(state.months && state.months.length === 1 && state.months[0] === -1);
  const yearsAll = !!(state.years && state.years.length === 1 && state.years[0] === -1);
  let periods: string[] = [];
  let selectedMonths: number[] | null = null;
  let selectedYears: number[] | null = null;

  const allMonthNums = [1,2,3,4,5,6,7,8,9,10,11,12];

  if (monthsAll && yearsAll) {
    periods = []; // all periods
    selectedMonths = null;
    selectedYears = null;
  } else if (monthsAll && !yearsAll) {
    const ys = uniq((state.years ?? [currentYear()]).filter((y) => y >= 1970 && y <= 2100)).sort((a,b)=>a-b);
    selectedMonths = null; // all months
    selectedYears = ys.length ? ys : [currentYear()];
    periods = (selectedYears).flatMap((y) => allMonthNums.map((m) => `${y}-${String(m).padStart(2, "0")}`));
  } else if (!monthsAll && yearsAll) {
    // All available years x selected months
    const ms = uniq((state.months ?? [currentMonth()]).filter((m) => m >= 1 && m <= 12)).sort((a,b)=>a-b);
    const availYears = await getAvailableYears(client);
    selectedMonths = ms.length ? ms : [currentMonth()];
    selectedYears = null; // all years
    const ys = availYears.length ? availYears : [currentYear()];
    periods = ys.flatMap((y) => selectedMonths!.map((m) => `${y}-${String(m).padStart(2, "0")}`));
  } else {
    const ms = uniq((state.months && state.months.length ? state.months : [currentMonth()]).filter((m) => m >= 1 && m <= 12)).sort((a,b)=>a-b);
    const ys = uniq((state.years && state.years.length ? state.years : [currentYear()]).filter((y) => y >= 1970 && y <= 2100)).sort((a,b)=>a-b);
    selectedMonths = ms.length ? ms : [currentMonth()];
    selectedYears = ys.length ? ys : [currentYear()];
    periods = selectedYears.flatMap((y) => selectedMonths!.map((m) => `${y}-${String(m).padStart(2, "0")}`));
    periods = uniq(periods).sort();
  }
  const periodRange = periods.length > 0 ? getPeriodsRange(periods) : null;

  // Labels
  let workspaceLabel = "Ongoing Workspaces";
  if (state.workspaceIds === null) {
    workspaceLabel = "Ongoing Workspaces";
  } else if (state.workspaceIds.length === 0) {
    workspaceLabel = "No workspaces selected";
  } else {
    const ongoing = accessible.filter((p) => !p.isCompleted);
    const completed = accessible.filter((p) => p.isCompleted);
    const selIds = new Set(projects.map((p) => p.id));
    const allOngoingSel = ongoing.length > 0 && ongoing.every((p) => selIds.has(p.id)) && completed.every((p) => !selIds.has(p.id));
    const allCompletedSel = completed.length > 0 && completed.every((p) => selIds.has(p.id)) && ongoing.every((p) => !selIds.has(p.id));
    const allSel = accessible.length > 0 && accessible.every((p) => selIds.has(p.id));
    if (allSel) workspaceLabel = "All Workspaces";
    else if (allOngoingSel) workspaceLabel = "Ongoing Workspaces";
    else if (allCompletedSel) workspaceLabel = "Completed Workspaces";
    else if (projects.length === 1) workspaceLabel = `${projects[0].key} · ${projects[0].name}`;
    else workspaceLabel = `${projects.length} workspaces`;
  }

  const periodLabel = (() => {
    if (periods === null && !selectedMonths && !selectedYears) return "All periods";
    const mLabel = selectedMonths === null ? "All months" : selectedMonths.length === 0 ? "No months" : selectedMonths.map((m) => MONTH_NAMES[m - 1]).join(", ");
    const yLabel = selectedYears === null ? "All years" : selectedYears.length === 0 ? "No years" : selectedYears.join(", ");
    if (periods === null && !selectedMonths && !selectedYears) return "All periods";
    return `${mLabel} ${yLabel}`.trim();
  })();
  const userLabel = !hasUserFilter
    ? "All users"
    : [
        ...(userIds.length > 0 ? [`${userIds.length} user${userIds.length === 1 ? "" : "s"}`] : []),
        ...(includeUnassigned ? ["Unassigned"] : []),
      ].join(", ") || "No users selected";

  return {
    projectIds,
    projects,
    userIds,
    includeUnassigned,
    hasUserFilter,
    periods,
    periodRange,
    selectedMonths,
    selectedYears,
    workspaceLabel,
    periodLabel,
    userLabel,
    viewerId: viewer.id,
    isAdmin: viewer.isSuperAdmin,
    isPmScoped,
  };
}

/** Date is within any of the selected month periods (by local month/year). null periods = unrestricted. */
export function inSelectedPeriods(date: Date | null | undefined, periods: string[] | null): boolean {
  if (!date) return false;
  if (periods === null) return true;
  if (periods.length === 0) return false;
  const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  return periods.includes(key);
}

/** Get available years for dashboard year filter (2026 through 2031). */
export async function getAvailableYears(_client: PrismaClient): Promise<number[]> {
  const start = 2026;
  return [start, start + 1, start + 2, start + 3, start + 4, start + 5];
}