import { z } from "zod";
import { fail, ok, requireUser, serverError } from "@/lib/api";
import { db } from "@/lib/db";
import { fetchCalendarData, widenRange } from "@/lib/calendar";

// Cross-project calendar feed with multi-select workspace/user filters.
const Query = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function GET(req: Request) {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;
  const url = new URL(req.url);
  const q = url.searchParams;
  const parsed = Query.safeParse({
    from: q.get("from") ?? undefined,
    to: q.get("to") ?? undefined,
  });
  if (!parsed.success) return fail(400, "validation", "from and to (YYYY-MM-DD) are required.");
  if (parsed.data.from > parsed.data.to) return fail(400, "validation", "from must not be after to.");
  let range;
  try {
    range = widenRange(parsed.data.from, parsed.data.to);
  } catch (e) {
    return fail(400, "validation", e instanceof Error ? e.message : "Invalid date.");
  }

  // Workspaces: repeated projectId params. absent => default ongoing. "__all__" => all in scope.
  const projectIdParams = q.getAll("projectId").filter(Boolean);
  let projectIds: string[] | undefined;
  if (projectIdParams.length === 0) {
    // default ongoing
    const { listProjectsForUser } = await import("@/lib/server");
    const accessible = await listProjectsForUser(auth.user.id, auth.user.isSuperAdmin, true, db);
    projectIds = accessible.filter((p) => !p.isCompleted).map((p) => p.id);
  } else if (projectIdParams.includes("__all__")) {
    projectIds = undefined; // all scoped
  } else {
    projectIds = projectIdParams;
  }

  // Assignees: repeated assigneeId params; "all" or absent => no filter (default all users)
  const rawAssignees = q.getAll("assigneeId").filter(Boolean);
  const assigneeAll = rawAssignees.length === 0 || rawAssignees.includes("all");
  const includeUnassigned = rawAssignees.includes("none");
  const assigneeIds = assigneeAll
    ? undefined
    : rawAssignees
        .filter((v) => v !== "all" && v !== "none")
        .map((v) => (v === "me" ? auth.user.id : v));

  try {
    const data = await fetchCalendarData(db, auth.user, {
      from: range.from,
      to: range.to,
      projectIds,
      assigneeIds,
      includeUnassigned: assigneeAll ? false : includeUnassigned,
    });
    return ok(data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "No access to this project.") return fail(403, "forbidden", msg);
    return serverError(e, "Could not load the calendar.");
  }
}
