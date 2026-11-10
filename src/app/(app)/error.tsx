"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Page error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 p-6 text-center">
      <h1 className="text-xl font-bold">Something went wrong</h1>
      <p className="max-w-md text-sm text-muted">
        This page hit an unexpected error. Nothing you did was lost — try again, or return to My Work.
      </p>
      {error.digest && <p className="font-mono text-xs text-muted">Error ID: {error.digest}</p>}
      <div className="mt-1 flex gap-2">
        <button
          onClick={reset}
          className="rounded bg-[#708AF4] px-3 py-1.5 text-sm font-semibold text-white hover:bg-[#5A76E8]"
        >
          Try again
        </button>
        <Link href="/" className="rounded border px-3 py-1.5 text-sm hover:bg-canvas dark:border-line dark:hover:bg-[var(--row-hover)]">
          Go to My Work
        </Link>
      </div>
    </div>
  );
}
