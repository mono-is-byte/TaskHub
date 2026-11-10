"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { buildDashboardPdf } from "@/lib/pdf";
import { IconDownload, IconChevronRight } from "@/components/icons";
import type { DashboardSummary } from "@/lib/dashboard";

interface DashboardExportRow {
  key: string;
  title: string;
  status: string;
  priority: string;
  due: string;
  workspace?: string;
  assignee?: string;
}

interface DashboardExportActivity {
  key: string;
  title: string;
  action: string;
  actor: string;
  when: string;
}

interface Props {
  /** Current dashboard filter query string (without leading ?) for server export. */
  queryString: string;
  /** Short file-name scope. */
  scopeKey: string;
  /** Human labels for report header. */
  workspaceLabel: string;
  periodLabel: string;
  userLabel: string;
  summary: DashboardSummary;
  assigned: DashboardExportRow[];
  qaQueue: DashboardExportRow[];
  overdue: DashboardExportRow[];
  recent: DashboardExportActivity[];
  taskDetails: DashboardExportRow[];
}

export default function DashboardExport(props: Props) {
  const [busy, setBusy] = useState<"" | "pdf" | "xlsx">("");
  const [err, setErr] = useState("");
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!open) return;
    const update = () => {
      const r = btnRef.current?.getBoundingClientRect();
      if (r) setPos({ top: r.bottom + 4, left: r.left });
    };
    update();
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open]);

  async function downloadPdf() {
    setErr("");
    setBusy("pdf");
    setOpen(false);
    try {
      const doc = await buildDashboardPdf({
        workspaceLabel: props.workspaceLabel,
        periodLabel: props.periodLabel,
        userLabel: props.userLabel,
        generatedAt: new Date(),
        summary: props.summary,
        assigned: props.assigned,
        qaQueue: props.qaQueue,
        overdue: props.overdue,
        recent: props.recent,
        taskDetails: props.taskDetails,
      });
      doc.save(`dashboard-${props.scopeKey}.pdf`);
    } catch {
      setErr("PDF export failed — please try again.");
    } finally {
      setBusy("");
    }
  }

  async function downloadXlsx() {
    setErr("");
    setBusy("xlsx");
    setOpen(false);
    let objectUrl = "";
    try {
      const qs = props.queryString ? `?${props.queryString}` : "";
      const res = await fetch(`/api/dashboard/export${qs}`);
      if (!res.ok) throw new Error("export failed");
      const blob = await res.blob();
      objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = `dashboard-${props.scopeKey}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch {
      setErr("Excel export failed — please try again.");
    } finally {
      if (objectUrl) setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);
      setBusy("");
    }
  }

  return (
    <span className="relative inline-flex flex-wrap items-center gap-2">
      <button
        ref={btnRef}
        type="button"
        className="tt-btn"
        onClick={() => setOpen((v) => !v)}
        disabled={busy !== ""}
        title="Download dashboard report"
      >
        <IconDownload className="h-3.5 w-3.5" />
        {busy === "pdf" ? "Preparing PDF…" : busy === "xlsx" ? "Preparing Excel…" : "Download"}
        <IconChevronRight className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-90" : ""}`} />
      </button>
      {open && createPortal(
        <div
          ref={panelRef}
          className="glass-strong fixed z-[60] w-40 rounded-md border border-line p-1 text-xs shadow-lg"
          style={{ top: pos.top, left: Math.max(8, Math.min(pos.left, window.innerWidth - 170)) }}
        >
          <button type="button" className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-line" onClick={() => void downloadPdf()}>
            Download PDF
          </button>
          <button type="button" className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-line" onClick={() => void downloadXlsx()}>
            Download Excel
          </button>
        </div>,
        document.body,
      )}
      {err && (
        <span className="text-xs text-red-600 dark:text-red-400" role="alert">{err}</span>
      )}
    </span>
  );
}