"use client";

import { LazyMotion, MotionConfig } from "framer-motion";

const loadFeatures = () =>
  import("@/lib/framerMotionFeatures").then((mod) => mod.default);

/**
 * Wraps the app tree so framer-motion honors the user's
 * `prefers-reduced-motion` setting. Users (and automated agents such as
 * Playwright emulating `reducedMotion: "reduce"`) that request reduced motion
 * get transform/layout animations disabled — an accessibility improvement that
 * also stabilizes E2E locator/click resolution.
 *
 * Also wraps the tree in `LazyMotion` so the framer-motion animation engine
 * (`domMax` features) is loaded asynchronously as a separate chunk instead of
 * being bundled synchronously. `strict` enforces that only `m.*` components
 * (not `motion.*`) are used within the tree.
 */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <LazyMotion features={loadFeatures} strict>
        {children}
      </LazyMotion>
    </MotionConfig>
  );
}
