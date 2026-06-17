/**
 * ChunkLoadError self-recovery (Task B / strategy B).
 *
 * A stale Service Worker can serve HTML that references deleted
 * `_next/static/chunks/*.js`. The lazy `import()` then rejects with a
 * ChunkLoadError and `<Suspense>` never resolves, leaving the user stuck.
 *
 * This module detects such failures and recovers ALREADY-broken devices by
 * clearing CacheStorage, unregistering the Service Worker, and reloading once.
 * A `sessionStorage` guard limits recovery to a single attempt per session so
 * we never enter an infinite reload loop.
 *
 * The pure detection (`isChunkLoadError`) and the side-effecting recovery
 * (`recoverFromChunkLoadError`) are separated from the window wiring
 * (`installChunkLoadRecovery`) so the logic is unit-testable against mocked
 * globals.
 */

/** sessionStorage key guarding against repeated recovery (reload loop). */
export const RECOVERY_GUARD_KEY = "pp:chunk-load-recovery";

/**
 * Returns true when `error` looks like a failed dynamic chunk import.
 *
 * Matches `error.name === "ChunkLoadError"` or a message containing
 * `Loading chunk` / `dynamically imported module`. Ordinary network errors
 * (e.g. "Failed to fetch") MUST NOT match.
 */
export function isChunkLoadError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  if (error.name === "ChunkLoadError") {
    return true;
  }
  const message = error.message;
  return (
    message.includes("Loading chunk") ||
    message.includes("dynamically imported module")
  );
}

interface RecoveryDeps {
  caches: CacheStorage | undefined;
  serviceWorker: ServiceWorkerContainer | undefined;
  sessionStorage: Storage;
  reload: () => void;
}

/**
 * Clears caches, unregisters Service Workers, then reloads once.
 *
 * No-ops if the guard flag is already set. The flag is set synchronously
 * BEFORE the async cleanup so a burst of ChunkLoadErrors cannot trigger
 * double recovery. Cleanup failures (e.g. a rejecting `unregister()`) are
 * swallowed so the reload still happens.
 */
export async function recoverFromChunkLoadError(
  deps: RecoveryDeps,
): Promise<void> {
  if (deps.sessionStorage.getItem(RECOVERY_GUARD_KEY)) {
    return;
  }
  // Set the guard up-front to prevent concurrent double recovery.
  deps.sessionStorage.setItem(RECOVERY_GUARD_KEY, "1");

  try {
    if (deps.caches) {
      const keys = await deps.caches.keys();
      await Promise.all(keys.map((key) => deps.caches?.delete(key)));
    }
    if (deps.serviceWorker) {
      const registrations = await deps.serviceWorker.getRegistrations();
      await Promise.all(
        registrations.map((registration) => registration.unregister()),
      );
    }
  } catch (err) {
    console.warn("Chunk-load recovery cleanup failed:", err);
  }

  deps.reload();
}

/**
 * Subscribes to `error` / `unhandledrejection` on `window` and runs recovery
 * when a ChunkLoadError is observed. Returns a cleanup function that removes
 * the listeners (mainly for tests / unmount).
 *
 * Production-only and feature-guarded, mirroring `ServiceWorkerRegister`.
 * No-ops (returns undefined) outside production or when `window` is absent.
 */
export function installChunkLoadRecovery(): (() => void) | undefined {
  if (process.env.NODE_ENV !== "production") {
    return undefined;
  }
  if (typeof window === "undefined") {
    return undefined;
  }

  const run = (error: unknown) => {
    if (!isChunkLoadError(error)) {
      return;
    }
    void recoverFromChunkLoadError({
      caches: typeof caches !== "undefined" ? caches : undefined,
      serviceWorker:
        "serviceWorker" in navigator ? navigator.serviceWorker : undefined,
      sessionStorage: window.sessionStorage,
      reload: () => window.location.reload(),
    });
  };

  const onError = (event: ErrorEvent) => {
    // Prefer the actual Error object; fall back to a synthetic one built from
    // the event message so message-based detection still works.
    run(event.error ?? new Error(event.message));
  };
  const onRejection = (event: PromiseRejectionEvent) => {
    run(event.reason);
  };

  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);

  return () => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRejection);
  };
}
