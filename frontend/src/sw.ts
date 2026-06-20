/// <reference lib="webworker" />
import type {
  PrecacheEntry,
  RuntimeCaching,
  SerwistGlobalConfig,
} from "serwist";
import {
  CacheFirst,
  ExpirationPlugin,
  NetworkFirst,
  NetworkOnly,
  Serwist,
} from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope & {
  __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
};

// Escape every regex metacharacter so any Lambda hostname (dashes, digits,
// dots, etc.) embeds safely into the host-anchored matcher below.
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
let apiHostMatcher: RegExp | null = null;
if (apiBaseUrl) {
  try {
    const host = escapeRegExp(new URL(apiBaseUrl).host);
    apiHostMatcher = new RegExp(`^https?://${host}/.*`, "i");
  } catch {
    apiHostMatcher = null;
  }
}

const runtimeCaching: RuntimeCaching[] = [
  {
    matcher: /^\/api\//,
    handler: new NetworkOnly(),
    method: "GET",
  },
  {
    matcher:
      /^\/(?:_next\/static\/|icon-[^/]*\.png$|favicon\.ico$|manifest\.webmanifest$)/,
    handler: new CacheFirst({
      cacheName: "pantry-static-assets",
      plugins: [
        new ExpirationPlugin({
          maxEntries: 128,
          maxAgeSeconds: 30 * 24 * 60 * 60,
        }),
      ],
    }),
    method: "GET",
  },
  {
    matcher: ({ request }) => request.destination === "document",
    handler: new NetworkFirst({
      cacheName: "pantry-document-pages",
      // Fall back to the cached document if the network is slow. Paired with
      // navigationPreload below, the browser starts the document fetch in
      // parallel with SW boot; this timeout bounds the worst-case wait before
      // serving the last-known-good shell from cache.
      networkTimeoutSeconds: 3,
    }),
    method: "GET",
  },
];

if (apiHostMatcher) {
  runtimeCaching.unshift({
    matcher: apiHostMatcher,
    handler: new NetworkOnly(),
    method: "GET",
  });
}

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  // Let the browser kick off the navigation (document) fetch in parallel with
  // SW boot instead of waiting for the worker to evaluate before fetching.
  // This removes the SW-boot serialization that caused a 2-3s white screen on
  // every PWA relaunch. Serwist calls enableNavigationPreload() for this flag,
  // and the NetworkFirst strategy automatically consumes event.preloadResponse.
  navigationPreload: true,
  runtimeCaching,
});

serwist.addEventListeners();
