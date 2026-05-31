/// <reference lib="webworker" />
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import {
  CacheFirst,
  ExpirationPlugin,
  NetworkOnly,
  RegExpRoute,
  Route,
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

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
let apiHostMatcher: RegExp | null = null;
if (apiBaseUrl) {
  try {
    const host = new URL(apiBaseUrl).host.replace(/[.]/g, "\\.");
    apiHostMatcher = new RegExp(`^https?://${host}/.*`, "i");
  } catch {
    apiHostMatcher = null;
  }
}

const apiPathRoute = new RegExpRoute(/^\/api\//, new NetworkOnly());

const staticAssetRoute = new RegExpRoute(
  /^\/(?:_next\/static\/|icon-[^/]*\.png$|favicon\.ico$|manifest\.webmanifest$)/,
  new CacheFirst({
    cacheName: "pantry-static-assets",
    plugins: [
      new ExpirationPlugin({
        maxEntries: 128,
        maxAgeSeconds: 30 * 24 * 60 * 60,
      }),
    ],
  }),
);

const documentRoute = new Route(
  ({ request }) => request.destination === "document",
  new StaleWhileRevalidate({
    cacheName: "pantry-document-pages",
  }),
);

const runtimeRoutes: Route[] = [apiPathRoute, staticAssetRoute, documentRoute];

if (apiHostMatcher) {
  runtimeRoutes.unshift(new RegExpRoute(apiHostMatcher, new NetworkOnly()));
}

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: false,
  runtimeCaching: runtimeRoutes.map((route) => ({
    matcher: route.match,
    handler: route.handler,
    method: "GET",
  })),
});

serwist.addEventListeners();
