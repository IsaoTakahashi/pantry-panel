/// <reference lib="webworker" />
import type {
  PrecacheEntry,
  RuntimeCaching,
  SerwistGlobalConfig,
} from "serwist";
import {
  CacheFirst,
  ExpirationPlugin,
  NetworkOnly,
  Serwist,
  StaleWhileRevalidate,
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
    handler: new StaleWhileRevalidate({
      cacheName: "pantry-document-pages",
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
  navigationPreload: false,
  runtimeCaching,
});

serwist.addEventListeners();
