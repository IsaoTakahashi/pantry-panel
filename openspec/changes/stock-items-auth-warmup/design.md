## Context

`/stock-items` sits behind `frontend/src/middleware.ts`'s `PROTECTED_PATHS`. An unauthenticated request never reaches the page's Vercel Function: middleware issues the 307 to `/login` itself, and Next.js short-circuits before the origin function runs (confirmed by measurement: the 307 response has no `x-matched-path` header, unlike `/login`'s 200 and `/api/health`'s 200, which both do). Vercel allocates one function per route, so warming `/api/health` (Issue #280) does not warm `/stock-items`. The only way to warm it is a real request that middleware accepts as authenticated.

A naive fix — configure cron-job.org with a fixed `Cookie` header — was ruled out: Supabase access tokens expire (~1h) and `middleware.ts`'s `getClaims()` refreshes them via the refresh token when needed. Refresh tokens rotate on use; a fixed cookie's refresh token is consumed on the first refresh and invalid on the next, so the ping would authenticate successfully for the first ~55 minutes and then silently 307 to `/login` forever after.

`frontend/e2e/global-setup.ts` already solves an adjacent problem — turning a `signInWithPassword` session into a valid `sb-<ref>-auth-token` cookie — for Playwright's `storageState`. It uses `@supabase/ssr`'s exported `createChunks` and `stringToBase64URL` directly (not `createServerClient` with a fake cookie jar), confirming the project's cookie encoding is the library default (`base64-` prefix, no custom `cookieEncoding` option set in either `supabaseClient.ts` or `supabaseServerClient.ts`).

## Goals / Non-Goals

**Goals:**
- A cron-job.org-triggerable endpoint that causes a real, authenticated render of `/stock-items` on this app's own production Vercel Function, at a cadence that keeps it warm.
- Avoid the refresh-token-rotation trap: never rely on a cookie value that outlives its own request.
- Keep Supabase Auth sign-in volume low enough to not risk rate limits.
- Fail loudly (non-200 from the warm endpoint) if the internal request doesn't actually reach `/stock-items` authenticated.

**Non-Goals:**
- Warming the Go backend Lambda — already handled by the existing direct `/health` ping (Issue #280 design.md).
- General-purpose test-user infrastructure — the warm user is single-purpose and unrelated to `frontend/e2e/global-setup.ts`'s E2E fixtures (see Decisions).
- Changing `/stock-items` or `middleware.ts` themselves.

## Decisions

- **Dedicated warm user, not the E2E test user.** Both use the same Supabase project (confirmed with the user), so reuse was technically possible, but two independent lifecycles would end up coupled: rotating the E2E password to fix a flaky test would silently break production warming, and vice versa. Sign-ins would also be double-counted against whatever Supabase Auth rate limit applies (E2E CI runs + a sign-in every warm cycle). A new low-privilege user, its own group, and one seed stock item are created once, manually, decoupled from CI.
- **Reuse `@supabase/ssr`'s `createChunks`/`stringToBase64URL` directly**, the same functions `global-setup.ts` already uses, rather than instantiating `createServerClient` with an in-memory cookie-jar shim. Fewer moving parts, and it's the exact mechanism already proven to produce cookies this app's middleware accepts.
- **Cache the session in module scope; sign in fresh only when needed.** A plain `supabase-js` client (`createClient`, not the SSR server client — this is a service-style caller, not a per-request cookie holder) signs in with `signInWithPassword` once, and the handler reuses the cached session across invocations as long as the access token has more than a few minutes of remaining lifetime, refreshing via `refreshSession()` otherwise (falling back to a fresh `signInWithPassword` if refresh fails). Because cron-job.org invokes this exact route every 2 minutes, its own traffic is what keeps the container (and the module-level cache) alive — this turns "sign in every 2 minutes" into "sign in roughly once per access-token lifetime," cutting Supabase Auth sign-in volume by roughly 30x versus a naive per-request sign-in.
- **Also set the `pantry-panel-active-group` cookie on the internal request.** `frontend/src/app/stock-items/getInitialStockItems.ts` reads this plain, non-httpOnly cookie (`frontend/src/lib/activeGroupCookie.ts`) to decide which group's data to fetch from the backend during SSR; without it, `getInitialStockItems()` returns `null` and the SSR path skips the backend fetch entirely (the page still renders via client-side fallback, but the Go backend's stock-items endpoint wouldn't be exercised by the warm ping). The warm route sets this cookie to a fixed `WARM_GROUP_ID` env var pointing at the seed group created in Migration Plan step 1.
- **`redirect: "manual"` on the internal fetch to `/stock-items`.** A 3xx must be treated as failure (it means the cookie didn't authenticate), not followed transparently into a 200 on `/login`.
- **Shared-secret header, not IP allowlisting.** cron-job.org's egress IPs aren't fixed/documented for this purpose; a header compared against a Vercel env var (`WARMUP_SHARED_SECRET`) is simpler and cron-job.org supports custom headers natively.

## Risks / Trade-offs

- [Supabase Auth sign-in rate limit] → Mitigated by the module-scope session cache (Decisions above), but the actual configured limit for this Supabase project hasn't been checked against real numbers. Verify in Supabase Dashboard → Authentication → Rate Limits before shipping; if the project-wide limit is tight, the cache strategy already keeps well under most reasonable defaults (roughly 1 sign-in/hour instead of 30/hour).
- [Module-scope cache doesn't survive a cold start or scale-out to a second instance] → Acceptable: a cold instance just signs in fresh once, same one-time cost as today; Vercel's low traffic to this route makes concurrent multi-instance fan-out unlikely, and even if it happens, at worst it means more sign-ins than the ideal, not incorrect behavior.
- [Warm ping and a real family's traffic could both hit `/stock-items` concurrently] → No shared mutable state; this is a plain authenticated GET like any real visit, so no special handling needed.
- [Endpoint becomes an open way to trigger sign-ins against this Supabase project] → Mitigated by the shared-secret header; treat `WARMUP_SHARED_SECRET` and the warm user's password with the same care as any other production credential.
- [This still doesn't warm the Go backend Lambda's *other* routes if the container was evicted] → Out of scope (Non-Goals); Issue #280's direct `/health` ping already addresses backend warmth independently, and a single-container LWA process warms all its own routes together once any one of them is hit.

## Migration Plan

1. Manually, once: create the dedicated warm user + group + one seed stock item in the production Supabase project (via the Supabase Dashboard and a couple of authenticated `POST` calls to the existing backend API, mirroring what `global-setup.ts` does for ephemeral E2E groups).
2. Add `WARM_USER_EMAIL`, `WARM_USER_PASSWORD`, `WARMUP_SHARED_SECRET` as Vercel production environment variables.
3. Implement and merge the `/api/warm/stock-items` route.
4. After deploy, manually verify the endpoint with `curl -H "x-warmup-secret: ..." https://<vercel-app>/api/warm/stock-items` returns 200.
5. Manually, once: add a new cron-job.org job (2-minute interval) pointed at the new endpoint with the shared-secret header configured.
6. Rollback: disable/delete the cron-job.org job; the route itself is inert without traffic and safe to leave deployed.

## Open Questions

- Exact Supabase Auth rate limit configured on this project — needs checking in the dashboard before go-live (task, not a blocker for writing the code).
