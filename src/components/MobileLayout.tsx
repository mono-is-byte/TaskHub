"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { api } from "@/lib/client";
import { WORKSPACE_LIST_ROWS, workspaceListMaxHeight } from "@/lib/sidebar";
import AppFooter from "./AppFooter";
import Avatar from "./Avatar";
import ConfirmDialog from "./ConfirmDialog";
import EditProjectDialog from "./EditProjectDialog";
import NotificationsBell from "./NotificationsBell";
import ThemeToggle from "./ThemeToggle";
import {
  IconAuditLog, IconCalendar, IconCheck, IconDots, IconHome, IconKey,
  IconListChecks, IconLogOut, IconPencil, IconPlus, IconTrash, IconUser, IconUsers,
} from "./icons";

export interface MobileProject {
  id: string;
  key: string;
  name: string;
  isCompleted: boolean;
  canManage: boolean;
}

export interface MobileUser {
  name: string;
  email: string;
  avatarUrl: string | null;
}

type Sheet = "workspaces" | "users" | "profile" | null;

/** Mobile sheet rows are 40px tall (minimum comfortable tap target) with a 4px gap. */
const SHEET_ROW_REM = 2.5;
const SHEET_GAP_REM = 0.25;
const sheetListMaxHeight = workspaceListMaxHeight(SHEET_ROW_REM, SHEET_GAP_REM);

/** The sticky top bar is the single source of truth for the page name on mobile. */
function usePageTitle(projects: MobileProject[]): string {
  const pathname = usePathname() ?? "/";
  if (pathname === "/") return "Dashboard";
  if (pathname.startsWith("/calendar")) return "Calendar";
  if (pathname.startsWith("/users")) return "Users";
  if (pathname.startsWith("/profile")) return "Profile";
  if (pathname.startsWith("/admin/roles")) return "Roles & Permissions";
  if (pathname.startsWith("/admin/audit")) return "Audit Log";
  if (pathname.startsWith("/p/")) {
    const id = pathname.split("/")[2] ?? "";
    const project = projects.find((p) => p.id === id);
    return project ? `${project.key} · ${project.name}` : "Workspace";
  }
  const last = pathname.split("/").filter(Boolean).pop() ?? "TaskHub";
  return last.replace(/-/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

/**
 * Focus trap + Escape close + body scroll lock + focus return, shared by the
 * bottom sheets and the logout dialog.
 */
function useDialogFocus(ref: { current: HTMLElement | null }, onClose: () => void) {
  useEffect(() => {
    const restore = document.activeElement as HTMLElement | null;
    const panel = ref.current;
    const focusables = () =>
      Array.from(
        panel?.querySelectorAll<HTMLElement>(
          'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter((el) => el.offsetParent !== null);

    (focusables()[0] ?? panel)?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); return; }
      if (e.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) { e.preventDefault(); return; }
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      restore?.focus?.();
    };
  }, [ref, onClose]);
}

/** Bottom sheet: drag handle, dimmed backdrop, mounted only while open. */
function Sheet({ label, onClose, children }: { label: string; onClose: () => void; children: ReactNode }) {
  const panelRef = useRef<HTMLDivElement>(null);
  useDialogFocus(panelRef, onClose);

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:p-3">
      <div className="absolute inset-0 bg-black/45" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className="relative flex w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-b-0 border-line bg-[var(--surface-popover)] shadow-2xl outline-none sm:rounded-2xl sm:border-b"
        style={{ maxHeight: "min(75dvh, 34rem)" }}
      >
        <div className="flex shrink-0 justify-center pb-1 pt-2">
          <div className="h-1.5 w-10 rounded-full bg-[var(--line-strong)]" aria-hidden="true" />
        </div>
        {/* One scroll area: the two lists keep their own 5-row caps, so this
            only scrolls when both are at their maximum. */}
        <div
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3"
          style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom, 0px))" }}
        >
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function SheetLink({ href, label, icon, onClose }: { href: string; label: string; icon: ReactNode; onClose: () => void }) {
  return (
    <Link
      href={href}
      onClick={onClose}
      className="flex min-h-11 items-center gap-2 rounded px-2 text-sm transition-colors hover:bg-[var(--row-hover)] hover:text-accent"
    >
      {icon}
      {label}
    </Link>
  );
}

function ProjectRow({
  project, expanded, onToggle, onEdit, onDelete, onNavigate,
}: {
  project: MobileProject;
  expanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onNavigate: () => void;
}) {
  return (
    <div className={`rounded ${expanded ? "bg-[var(--row-hover)]" : ""}`}>
      <div className="flex h-10 items-center gap-1">
        <Link
          href={`/p/${project.id}/board`}
          onClick={onNavigate}
          className={`flex min-w-0 flex-1 items-center gap-2 rounded px-2 ${project.isCompleted ? "text-muted" : ""}`}
          title={`${project.key} ${project.name}`}
        >
          <span className="shrink-0 font-mono text-[11px] text-muted">{project.key}</span>
          <span className="min-w-0 flex-1 truncate text-sm">{project.name}</span>
          {project.isCompleted && (
            <span className="shrink-0 text-green-600 dark:text-green-400" title="All tasks are done">
              <IconCheck className="h-3.5 w-3.5" />
            </span>
          )}
        </Link>
        {project.canManage && (
          <button
            type="button"
            onClick={onToggle}
            aria-label={`Actions for ${project.name}`}
            aria-expanded={expanded}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded text-muted transition-colors hover:bg-line hover:text-accent"
          >
            <IconDots className="h-4 w-4" />
          </button>
        )}
      </div>
      {expanded && project.canManage && (
        <div className="flex gap-2 px-2 pb-2">
          <button
            type="button"
            onClick={onEdit}
            className="flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded border border-line px-2 text-xs hover:bg-line"
          >
            <IconPencil className="h-3.5 w-3.5" /> Edit project
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded border border-line px-2 text-xs text-red-600 hover:bg-line dark:text-red-400"
          >
            <IconTrash className="h-3.5 w-3.5" /> Delete
          </button>
        </div>
      )}
    </div>
  );
}

function WorkspacesSheet({
  projects, canCreate, onClose,
}: {
  projects: MobileProject[];
  canCreate: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const active = projects.filter((p) => !p.isCompleted);
  const completed = projects.filter((p) => p.isCompleted);
  const activeScrolls = active.length > WORKSPACE_LIST_ROWS;
  const completedScrolls = completed.length > WORKSPACE_LIST_ROWS;

  const [creating, setCreating] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [actionFor, setActionFor] = useState<string | null>(null);
  const [editing, setEditing] = useState<MobileProject | null>(null);
  const [deleting, setDeleting] = useState<MobileProject | null>(null);

  async function create() {
    if (!newKey.trim() || !newName.trim()) { setMsg("Key and name are required."); return; }
    setBusy(true);
    setMsg("");
    try {
      const r = await api<{ project: { id: string } }>("/api/projects", {
        method: "POST",
        body: JSON.stringify({ key: newKey.trim().toUpperCase(), name: newName.trim() }),
      });
      setCreating(false);
      setNewKey("");
      setNewName("");
      onClose();
      router.push(`/p/${r.project.id}/board`);
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not create project.");
    } finally {
      setBusy(false);
    }
  }

  async function saveProject(p: MobileProject, key: string, name: string) {
    setBusy(true);
    setMsg("");
    try {
      await api(`/api/projects/${p.id}/settings`, { method: "PATCH", body: JSON.stringify({ key, name }) });
      setEditing(null);
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not save the project.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(p: MobileProject) {
    setBusy(true);
    setMsg("");
    try {
      await api(`/api/projects/${p.id}`, { method: "DELETE" });
      setDeleting(null);
      if (pathname.startsWith(`/p/${p.id}`)) router.push("/");
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Delete failed.");
    } finally {
      setBusy(false);
    }
  }

  const rows = (list: MobileProject[]) => list.map((p) => (
    <ProjectRow
      key={p.id}
      project={p}
      expanded={actionFor === p.id}
      onToggle={() => setActionFor((id) => (id === p.id ? null : p.id))}
      onEdit={() => { setActionFor(null); setEditing(p); setMsg(""); }}
      onDelete={() => { setActionFor(null); setDeleting(p); setMsg(""); }}
      onNavigate={onClose}
    />
  ));

  return (
    <>
      <Sheet label="Workspaces" onClose={onClose}>
        <div className="mb-1 flex items-center justify-between px-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">ONGOING ({active.length})</span>
          {canCreate && (
            <button
              type="button"
              onClick={() => { setCreating((v) => !v); setMsg(""); }}
              aria-label="New workspace"
              aria-expanded={creating}
              className="flex h-10 w-10 items-center justify-center rounded text-muted hover:bg-line hover:text-accent"
            >
              <IconPlus className="h-4 w-4" />
            </button>
          )}
        </div>
        {msg && <p className="px-1 pb-1 text-[11px] text-red-600 dark:text-red-400">{msg}</p>}
        {creating && (
          <div className="mb-2 rounded-lg border border-line p-2">
            <input
              value={newKey}
              onChange={(e) => setNewKey(e.target.value.toUpperCase())}
              placeholder="KEY (e.g. MAP)"
              maxLength={10}
              className="mb-1 w-full rounded border border-line bg-surface px-2 py-1.5 font-mono text-xs"
            />
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Project name"
              maxLength={120}
              className="mb-1 w-full rounded border border-line bg-surface px-2 py-1.5 text-xs"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={create}
                disabled={busy}
                className="min-h-10 rounded-md bg-[#708AF4] px-3 text-xs font-semibold text-white transition-colors hover:bg-[#5A76E8] disabled:opacity-50"
              >
                Create
              </button>
              <button
                type="button"
                onClick={() => { setCreating(false); setMsg(""); }}
                className="min-h-10 rounded border border-line px-3 text-xs"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
        <div
          className={activeScrolls ? "overflow-y-auto scroll-thin" : ""}
          style={activeScrolls ? { maxHeight: sheetListMaxHeight } : undefined}
        >
          <div className="flex flex-col gap-1">{rows(active)}</div>
        </div>
        {active.length === 0 && <p className="px-1 py-2 text-xs text-muted">No ongoing workspaces.</p>}

        {completed.length > 0 && (
          <div className="mt-4">
            <div className="mb-1 px-1 text-xs font-semibold uppercase tracking-wide text-muted">COMPLETED ({completed.length})</div>
            <div
              className={completedScrolls ? "overflow-y-auto scroll-thin" : ""}
              style={completedScrolls ? { maxHeight: sheetListMaxHeight } : undefined}
            >
              <div className="flex flex-col gap-1">{rows(completed)}</div>
            </div>
          </div>
        )}
      </Sheet>

      {editing && (
        <EditProjectDialog
          project={{ key: editing.key, name: editing.name }}
          busy={busy}
          error={msg}
          onCancel={() => { setEditing(null); setMsg(""); }}
          onSave={(key, name) => saveProject(editing, key, name)}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title={`Delete project “${deleting.key} ${deleting.name}”?`}
          body="Every task, comment and history entry in this project is permanently removed, and no member will see it anymore. This cannot be undone."
          busy={busy}
          error={msg}
          onCancel={() => { setDeleting(null); setMsg(""); }}
          onConfirm={() => remove(deleting)}
        />
      )}
    </>
  );
}

function UsersSheet({ isSuperAdmin, onClose }: { isSuperAdmin: boolean; onClose: () => void }) {
  return (
    <Sheet label="Users" onClose={onClose}>
      <div className="flex flex-col gap-1 pb-1">
        <SheetLink href="/users" label="Users" icon={<IconUsers className="h-4 w-4" />} onClose={onClose} />
        {isSuperAdmin && (
          <SheetLink href="/admin/roles" label="Roles & Permissions" icon={<IconKey className="h-4 w-4" />} onClose={onClose} />
        )}
        {isSuperAdmin && (
          <SheetLink href="/admin/audit" label="Audit Log" icon={<IconAuditLog className="h-4 w-4" />} onClose={onClose} />
        )}
      </div>
    </Sheet>
  );
}

function ProfileSheet({
  user, roleLabel, onClose, onLogout,
}: {
  user: MobileUser;
  roleLabel: string;
  onClose: () => void;
  onLogout: () => void;
}) {
  return (
    <Sheet label="Profile" onClose={onClose}>
      <div className="mb-2 flex items-center gap-2 rounded-lg border border-line bg-surface px-2 py-2">
        <Avatar name={user.name} url={user.avatarUrl} size={32} />
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold" title={user.email}>{user.name}</div>
          <div className="truncate text-xs text-muted" title={roleLabel}>{roleLabel}</div>
        </div>
      </div>
      <div className="flex flex-col gap-1 pb-1">
        <SheetLink href="/profile" label="Profile settings" icon={<IconUser className="h-4 w-4" />} onClose={onClose} />
        <button
          type="button"
          onClick={onLogout}
          className="flex min-h-11 items-center gap-2 rounded px-2 text-sm text-red-600 transition-colors hover:bg-line dark:text-red-400"
        >
          <IconLogOut className="h-4 w-4" /> Logout
        </button>
      </div>
    </Sheet>
  );
}

function LogoutDialog({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => Promise<void> }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useDialogFocus(panelRef, onCancel);

  async function confirm() {
    setBusy(true);
    setError("");
    try {
      await onConfirm();
    } catch {
      setError("Could not log out. Try again.");
      setBusy(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/45 p-3 sm:items-center" onClick={onCancel}>
      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-label="Log out"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl border border-line bg-[var(--surface-popover)] p-4 shadow-2xl outline-none"
        style={{ marginBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <h2 className="mb-1 text-sm font-bold">Log out?</h2>
        <p className="mb-3 text-xs text-muted">You will need to sign in again to keep working in TaskHub.</p>
        {error && <p className="mb-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
        <div className="flex gap-2">
          <button type="button" onClick={onCancel} className="min-h-11 flex-1 rounded border border-line px-3 text-sm hover:bg-line">
            Cancel
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={busy}
            className="min-h-11 flex-1 rounded bg-red-600 px-3 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-50"
          >
            {busy ? "Logging out…" : "Logout"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function TabLink({ href, label, icon, active }: { href: string; label: string; icon: ReactNode; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-[10px] font-medium transition-colors ${
        active ? "text-[#708AF4]" : "text-muted hover:text-accent"
      }`}
    >
      {icon}
      <span>{label}</span>
    </Link>
  );
}

function TabButton({
  label, icon, active, open, onClick, popup,
}: {
  label: string;
  icon: ReactNode;
  active: boolean;
  open: boolean;
  onClick: () => void;
  popup: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      aria-haspopup={popup ? "dialog" : undefined}
      aria-expanded={popup ? open : undefined}
      className={`flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-[10px] font-medium transition-colors ${
        active ? "text-[#708AF4]" : "text-muted hover:text-accent"
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

export default function MobileLayout({
  user, roleLabel, projects, canCreate, isSuperAdmin, canUseUsers, children,
}: {
  user: MobileUser;
  roleLabel: string;
  projects: MobileProject[];
  canCreate: boolean;
  isSuperAdmin: boolean;
  canUseUsers: boolean;
  children: ReactNode;
}) {
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const title = usePageTitle(projects);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const mainRef = useRef<HTMLElement>(null);

  const close = useCallback(() => setSheet(null), []);
  const closeLogout = useCallback(() => setLogoutOpen(false), []);

  // Close whatever is open and reset the content scroll on any route change
  // (the content area is its own scroll container, so the browser does not do
  // this for us).
  useEffect(() => {
    setSheet(null);
    mainRef.current?.scrollTo({ top: 0 });
  }, [pathname]);

  // Keep the workspace list fresh, exactly like the desktop sidebar (SSE with a
  // slow polling fallback when the stream cannot connect).
  useEffect(() => {
    let stopped = false;
    let es: EventSource | null = null;
    let poll: ReturnType<typeof setInterval> | null = null;
    const refresh = () => { if (!stopped) router.refresh(); };
    try {
      es = new EventSource("/api/events");
      es.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data) as { type?: string };
          if (data.type === "projects_changed") refresh();
        } catch { /* ignore malformed frames */ }
      };
      es.onerror = () => {
        es?.close();
        es = null;
        if (!poll && !stopped) poll = setInterval(refresh, 30000);
      };
    } catch {
      poll = setInterval(refresh, 30000);
    }
    return () => {
      stopped = true;
      es?.close();
      if (poll) clearInterval(poll);
    };
  }, [router]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const inWorkspace = pathname.startsWith("/p/");
  const onCalendar = pathname === "/calendar" || pathname.startsWith("/calendar/");
  const onUsers = pathname === "/users" || pathname.startsWith("/admin/roles") || pathname.startsWith("/admin/audit");
  const onProfile = pathname === "/profile" || pathname.startsWith("/profile/");
  const profileActive = onProfile || sheet === "profile";

  return (
    // Full-height shell: header, scrolling content and bottom nav are flex
    // children, so the nav is structurally pinned and can never be pushed
    // off-screen by browser chrome or a fixed-position quirk.
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-[var(--canvas)]">
      {/* Top bar: logo + page title (single source of truth) + theme + bell. */}
      <header
        className="z-30 shrink-0 border-b border-line bg-[var(--sidebar-bg)]"
        style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
      >
        <div className="mx-auto flex h-14 w-full max-w-3xl items-center gap-2 px-3">
          <Link href="/" aria-label="TaskHub — Dashboard" className="shrink-0">
            <Image src="/logo/taskhub-full.svg" alt="TaskHub" width={844} height={369} unoptimized className="h-7 w-auto" />
          </Link>
          <h1 className="min-w-0 flex-1 truncate text-sm font-semibold" title={title}>{title}</h1>
          <div className="flex shrink-0 items-center gap-1 [&_button]:min-h-10 [&_button]:min-w-10 [&_button]:justify-center">
            <ThemeToggle />
            <NotificationsBell />
          </div>
        </div>
      </header>

      {/* The only scrolling region of the shell. */}
      <main ref={mainRef} className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
        <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 pb-6 pt-4">
          {children}
          <AppFooter />
        </div>
      </main>

      {/* Bottom navigation: exactly 5 tabs, part of the shell (never scrolls). */}
      <nav
        aria-label="Main navigation"
        className="z-40 shrink-0 border-t border-line bg-[var(--sidebar-bg)]"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <div className="mx-auto flex w-full max-w-xl items-stretch justify-around">
          <TabLink href="/" label="Dashboard" active={pathname === "/"} icon={<IconHome className="h-5 w-5" />} />
          <TabButton
            label="Workspaces"
            popup
            open={sheet === "workspaces"}
            active={inWorkspace || sheet === "workspaces"}
            onClick={() => setSheet((s) => (s === "workspaces" ? null : "workspaces"))}
            icon={<IconListChecks className="h-5 w-5" />}
          />
          <TabLink href="/calendar" label="Calendar" active={onCalendar} icon={<IconCalendar className="h-5 w-5" />} />
          {canUseUsers ? (
            <TabButton
              label="Users"
              popup
              open={sheet === "users"}
              active={onUsers || sheet === "users"}
              onClick={() => setSheet((s) => (s === "users" ? null : "users"))}
              icon={<IconUsers className="h-5 w-5" />}
            />
          ) : (
            <TabLink href="/users" label="Users" active={onUsers} icon={<IconUsers className="h-5 w-5" />} />
          )}
          <TabButton
            label="Profile"
            popup
            open={sheet === "profile"}
            active={profileActive}
            onClick={() => setSheet((s) => (s === "profile" ? null : "profile"))}
            icon={
              <span
                aria-hidden="true"
                className={`inline-flex rounded-full p-0.5 ${profileActive ? "ring-2 ring-[#708AF4]" : ""}`}
              >
                <Avatar name={user.name} url={user.avatarUrl} size={24} />
              </span>
            }
          />
        </div>
      </nav>

      {sheet === "workspaces" && (
        <WorkspacesSheet projects={projects} canCreate={canCreate} onClose={close} />
      )}
      {sheet === "users" && <UsersSheet isSuperAdmin={isSuperAdmin} onClose={close} />}
      {sheet === "profile" && (
        <ProfileSheet
          user={user}
          roleLabel={roleLabel}
          onClose={close}
          onLogout={() => { setSheet(null); setLogoutOpen(true); }}
        />
      )}
      {logoutOpen && <LogoutDialog onCancel={closeLogout} onConfirm={logout} />}
    </div>
  );
}
