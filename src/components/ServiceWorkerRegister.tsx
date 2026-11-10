"use client";

import { useEffect } from "react";

const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000; // periodic check (when lifecycle permits)

/**
 * Standards-based service worker registration & automatic update flow.
 * - Detects new SW versions (updatefound/statechange, waiting worker).
 * - Asks the waiting worker to SKIP_WAITING and reloads once on controllerchange.
 * - Checks for updates on launch, when the app becomes visible, and periodically.
 * Works across browsers that support Service Workers (Chromium, Firefox where
 * supported, Android browsers). Does not rely on Chrome-only APIs.
 */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return;

    let refreshing = false;
    let updateInterval: number | null = null;
    let hadController = !!navigator.serviceWorker.controller;

    const safeUpdate = (reg: ServiceWorkerRegistration) => {
      if (typeof reg.update === "function") {
        reg.update().catch(() => {});
      }
    };

    const requestActivation = (worker: ServiceWorker) => {
      try {
        worker.postMessage({ type: "SKIP_WAITING" });
      } catch {
        // ignore
      }
    };

    const monitorInstalling = (reg: ServiceWorkerRegistration) => {
      const installing = reg.installing;
      if (!installing) return;
      installing.addEventListener("statechange", () => {
        if (installing.state === "installed" && reg.waiting) {
          // Activate updates automatically, and also first installs so SW can control/offline.
          requestActivation(reg.waiting);
        } else if (installing.state === "installed") {
          // Fallback: some browsers expose the worker as installing until activated.
          requestActivation(installing);
        }
      });
    };

    const onControllerChange = () => {
      // First-time control (no prior controller) — no reload needed.
      if (!hadController) {
        hadController = !!navigator.serviceWorker.controller;
        return;
      }
      if (refreshing) return;
      refreshing = true;
      // Reload once to serve the new version. Guard prevents multiple reloads/loops.
      try {
        window.location.reload();
      } catch {
        // ignore
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        navigator.serviceWorker.getRegistration().then((reg) => {
          if (reg) safeUpdate(reg);
        }).catch(() => {});
      }
    };

    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
    document.addEventListener("visibilitychange", onVisibilityChange);

    const register = async () => {
      try {
        const reg = await navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" });

        // A worker may already be waiting (e.g. update downloaded in a previous session
        // or a first install that hasn't activated yet).
        if (reg.waiting) {
          requestActivation(reg.waiting);
        }

        reg.addEventListener("updatefound", () => monitorInstalling(reg));

        // Initial update check on launch.
        safeUpdate(reg);

        // Periodic checks where the page lifecycle permits.
        updateInterval = window.setInterval(() => safeUpdate(reg), UPDATE_CHECK_INTERVAL_MS);
      } catch {
        // Registration/update not supported or blocked (e.g. private mode in some browsers).
      }
    };

    register();

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      if (updateInterval !== null) window.clearInterval(updateInterval);
    };
  }, []);

  return null;
}
