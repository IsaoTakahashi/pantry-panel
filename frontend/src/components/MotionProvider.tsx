"use client";

import { MotionConfig } from "framer-motion";

/**
 * Wraps the app tree so framer-motion honors the user's
 * `prefers-reduced-motion` setting. Users (and automated agents such as
 * Playwright emulating `reducedMotion: "reduce"`) that request reduced motion
 * get transform/layout animations disabled — an accessibility improvement that
 * also stabilizes E2E locator/click resolution.
 */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
