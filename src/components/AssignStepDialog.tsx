"use client";

import { useMemo, useState } from "react";
import { suggestedForStatus } from "@/lib/workflow";
import { userOptionLabel } from "@/lib/memberLabel";
import Avatar from "@/components/Avatar";
import type { Lookups } from "@/hooks/useProject";

interface Props {
  lookups: Lookups;
  statusId: string; // target status the user picked
  currentAssigneeId?: string | null;
  onConfirm: (assigneeId: string | null) => void; // null = skip (status change only)
  onCancel: () => void;
}

/**
 * "Assign to" step shown during a status change:
 * members whose (free-text) designation matches the new status's suggestion
 * list come first, everyone else stays selectable, and the step can be skipped
 * entirely.
 */
export default function AssignStepDialog({ lookups, statusId, currentAssigneeId, onConfirm, onCancel }: Props) {
  const [picked, setPicked] = useState<string | null>(currentAssigneeId ?? null);

  const status = lookups.statuses.find((s) => s.id === statusId);
  const { suggested, others } = useMemo(
    () => suggestedForStatus(lookups.members, status?.designationRoleIds ?? []),
    [lookups.members, status],
  );

  const row = (m: Lookups["members"][number], isSuggested: boolean) => {
    const label = userOptionLabel(m);
    return (
      <button
        key={m.userId}
        onClick={() => setPicked(m.userId === picked ? null : m.userId)}
        title={label}
        className={`flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left text-sm transition-colors ${
          picked === m.userId
            ? "border-[#708AF4] bg-[rgba(112,138,244,0.12)]"
            : "border-line hover:bg-[var(--row-hover)]"
        }`}
      >
        <Avatar name={m.name} url={m.avatarUrl} size={20} />
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {isSuggested && (
          <span className="ml-auto shrink-0 rounded-full bg-emerald-100 px-1.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
            Suggested
          </span>
        )}
        {m.userId === currentAssigneeId && (
          <span className="shrink-0 text-[10px] text-muted">(current)</span>
        )}
      </button>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onCancel}>
      <div
        role="dialog"
        aria-label="Assign to"
        className="glass-strong w-full max-w-sm rounded-xl p-4 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h4 className="mb-1 font-semibold">
          Move to {status?.name ?? "status"} — assign to…
        </h4>
        <p className="mb-3 text-xs text-muted">
          {suggested.length > 0
            ? "Members holding a role this status suggests are shown first."
            : "Pick a user, or skip to move the task without changing its assignee."}
        </p>

        <div className="mb-2 max-h-60 space-y-1 overflow-auto">
          {suggested.map((m) => row(m, true))}
          {others.length > 0 && suggested.length > 0 && (
            <p className="pt-1 text-[10px] uppercase tracking-wide text-muted">Other users</p>
          )}
          {others.map((m) => row(m, false))}
          {suggested.length === 0 && others.length === 0 && (
            <p className="text-xs text-muted">No users available.</p>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="tt-btn text-sm">
            Cancel
          </button>
          <button
            onClick={() => onConfirm(picked === currentAssigneeId ? null : picked)}
            className="rounded-md bg-[#708AF4] px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-[#5A76E8]"
          >
            {picked ? "Move & assign" : "Skip — just move"}
          </button>
        </div>
      </div>
    </div>
  );
}
