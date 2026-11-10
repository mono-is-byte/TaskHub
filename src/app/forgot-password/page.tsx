"use client";

import { useState } from "react";

export default function ForgotPasswordPage() {
  const [identifier, setIdentifier] = useState("");
  const [done, setDone] = useState(false);
  const [adminReset, setAdminReset] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch("/api/auth/forgot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier }),
      });
      const json = await res.json();
      setDone(true);
      setAdminReset(Boolean(json.data?.adminReset));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas p-4">
      <form onSubmit={submit} className="tt-card w-full max-w-sm p-6">
        <h1 className="text-xl font-bold tracking-tight">Forgot password</h1>
        {done ? (
          <p className="mt-2 text-sm" style={{ color: "var(--text-secondary)" }}>
            {adminReset
              ? "This server does not send email. Ask an administrator to reset your password from Admin → Users."
              : "If the account exists, a reset link was issued. Check with your administrator."}
          </p>
        ) : (
          <>
            <p className="mb-4 mt-1 text-sm text-muted">Enter your email or username.</p>
            <input
              className="tt-input mb-4"
              value={identifier} onChange={(e) => setIdentifier(e.target.value)} required
            />
            <button type="submit" disabled={busy} className="tt-btn-primary w-full">
              {busy ? "Sending…" : "Request reset"}
            </button>
          </>
        )}
        <a href="/login" className="mt-3 block text-center text-sm font-medium text-[#708AF4] hover:underline">Back to login</a>
      </form>
    </div>
  );
}
