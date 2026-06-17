"use client";

import { useEffect } from "react";
import { installChunkLoadRecovery } from "@/lib/chunkLoadRecovery";

/**
 * Mounts the ChunkLoadError self-recovery safety net.
 *
 * Recovers devices stuck on a stale Service Worker that serves HTML
 * referencing deleted `_next/static/chunks/*.js`: on a ChunkLoadError it
 * clears caches, unregisters the SW, and reloads once.
 *
 * All guards (production-only, `typeof window`, feature detection, one-shot
 * sessionStorage flag) live in `installChunkLoadRecovery`.
 */
export function ChunkLoadRecovery() {
  useEffect(() => installChunkLoadRecovery(), []);

  return null;
}
