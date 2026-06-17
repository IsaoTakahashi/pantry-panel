import withSerwistInit from "@serwist/next";
import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

const withSerwist = withSerwistInit({
  swSrc: "src/sw.ts",
  swDest: "public/sw.js",
  disable: isDev,
  scope: "/",
  register: false,
  reloadOnOnline: true,
  // Setting additionalPrecacheEntries overrides the default public/ glob in
  // @serwist/next 9.x. So we list every asset we want pre-cached explicitly:
  //   - manifest + favicon are served from app/
  //   - icon-{192,512}.png + icon.svg live in public/ but must be re-listed
  //     here because the auto-glob is disabled once we add any entries.
  // NOTE: the shell HTML (/stock-items) is intentionally NOT pre-cached.
  //   Pre-caching it with `revision: null` freezes a copy that references the
  //   first-visit `_next/static/chunks/*` hashes; after a deploy those chunks
  //   404 and the lazy Suspense import never resolves (skeleton hangs).
  //   document navigations are served at runtime via NetworkFirst (see sw.ts).
  additionalPrecacheEntries: [
    { url: "/manifest.webmanifest", revision: null },
    { url: "/favicon.ico", revision: null },
    { url: "/icon-192.png", revision: null },
    { url: "/icon-512.png", revision: null },
    { url: "/icon.svg", revision: null },
  ],
});

const nextConfig: NextConfig = {
  cacheComponents: true,
};

// Apply Serwist only when SW generation is actually wanted (production build).
// Wrapping in dev injects a webpack config, which conflicts with Turbopack
// (Next.js 16 default) and forces `--webpack` in dev too.
export default isDev ? nextConfig : withSerwist(nextConfig);
