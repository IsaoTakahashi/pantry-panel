import withSerwistInit from "@serwist/next";
import type { NextConfig } from "next";

const withSerwist = withSerwistInit({
  swSrc: "src/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
  scope: "/",
  register: false,
  reloadOnOnline: true,
  // Setting additionalPrecacheEntries overrides the default public/ glob in
  // @serwist/next 9.x. So we list every asset we want pre-cached explicitly:
  //   - Shell HTML (/stock-items) + manifest + favicon are served from app/
  //   - icon-{192,512}.png + icon.svg live in public/ but must be re-listed
  //     here because the auto-glob is disabled once we add any entries.
  additionalPrecacheEntries: [
    { url: "/stock-items", revision: null },
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

export default withSerwist(nextConfig);
