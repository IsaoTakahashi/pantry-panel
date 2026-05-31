import withSerwistInit from "@serwist/next";
import type { NextConfig } from "next";

const withSerwist = withSerwistInit({
  swSrc: "src/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
  scope: "/",
  register: false,
  reloadOnOnline: true,
  // Next.js serves these from app/ rather than public/, so they are not picked
  // up by the default glob. Explicitly include shell HTML + dynamic assets so
  // PWA cold starts can render the shell without any network fetch.
  additionalPrecacheEntries: [
    { url: "/stock-items", revision: null },
    { url: "/manifest.webmanifest", revision: null },
    { url: "/favicon.ico", revision: null },
  ],
});

const nextConfig: NextConfig = {
  cacheComponents: true,
};

export default withSerwist(nextConfig);
