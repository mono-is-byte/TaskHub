"use client";

import { useRouter } from "next/navigation";
import { IconLogOut } from "./icons";

export default function LogoutButton() {
  const router = useRouter();
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }
  return (
    <button
      onClick={logout}
      title="Log out"
      className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-muted transition-colors hover:bg-line hover:text-accent"
    >
      <IconLogOut className="h-4 w-4" /> <span className="sb-label">Logout</span>
    </button>
  );
}
