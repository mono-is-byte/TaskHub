"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ChangePasswordPage() {
  const router = useRouter();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (next !== confirm) {
      setError("New passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current, next }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error?.message ?? "Could not change password.");
        return;
      }
      router.push("/");
      router.refresh();
    } catch {
      setError("Network error. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas p-4">
      <form onSubmit={submit} className="tt-card w-full max-w-sm p-6">
        <h1 className="text-xl font-bold tracking-tight">Set a new password</h1>
        <p className="mb-4 mt-1 text-sm text-muted">
          Your account uses a temporary password. Choose a new one (min 8 chars, upper + lower + digit).
        </p>
        {error && <p role="alert" className="mb-3 rounded-md border border-[rgba(239,68,68,0.3)] bg-[rgba(239,68,68,0.12)] p-2 text-sm text-[#B91C1C] dark:text-[#FCA5A5]">{error}</p>}
        <label className="mb-2 block text-sm font-medium">
          Current (temporary) password
          <input type="password" className="tt-input mt-1"
            value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" required />
        </label>
        <label className="mb-2 block text-sm font-medium">
          New password
          <input type="password" className="tt-input mt-1"
            value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" required />
        </label>
        <label className="mb-4 block text-sm font-medium">
          Confirm new password
          <input type="password" className="tt-input mt-1"
            value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required />
        </label>
        <button type="submit" disabled={busy} className="tt-btn-primary w-full">
          {busy ? "Saving…" : "Save new password"}
        </button>
      </form>
    </div>
  );
}
