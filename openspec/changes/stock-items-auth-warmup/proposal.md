## Why

`/stock-items` is behind Next.js middleware (`PROTECTED_PATHS`). Measurement confirmed an unauthenticated ping never reaches the page's Vercel Function — middleware returns the 307 to `/login` before the origin function is invoked (no `x-matched-path` header, ~140-170ms response with no body-transfer tail). Since Vercel allocates a separate function per route, no existing warmup ping (`/api/health`, backend Lambda `/health`) keeps this route's function warm. Real logged-in users experience this route's cold start (Issue #280 investigation, Issue #281).

## What Changes

- Add a new warm-up API route (`/api/warm/stock-items`) that authenticates as a dedicated warm-only Supabase user, builds a valid session cookie the same way `frontend/e2e/global-setup.ts` already does (`@supabase/ssr`'s `createChunks` + `stringToBase64URL`, `base64-` prefixed JSON), and issues a server-side `fetch` to this app's own `/stock-items` with that cookie — reproducing "an authenticated user opens `/stock-items`" without needing to hand a live browser session to an external cron service.
- Cache the signed-in session in module scope and only re-sign-in (or re-use within the access token's remaining lifetime) rather than performing a fresh password sign-in on every 2-minute ping, to keep Supabase Auth sign-in volume low.
- Protect the route with a shared-secret header so it can't be triggered by arbitrary traffic and burn Supabase Auth quota.
- Treat any non-200 response from the internal `/stock-items` fetch (in particular a 3xx to `/login`) as a warmup failure, not a silent success.
- One-time manual setup (outside the deploy pipeline): create a dedicated low-privilege Supabase Auth user + a small group with at least one stock item, add its credentials and the shared secret as Vercel production environment variables, and point a new cron-job.org job at the new endpoint.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `warmup-scheduler`: adds a requirement that `/stock-items` is kept warm via an authenticated internal round-trip, distinct from the existing unauthenticated/health-check pings, and states the constraints that make a naive fixed-cookie approach unsafe (Supabase refresh-token rotation).

## Impact

- New file: `frontend/src/app/api/warm/stock-items/route.ts` (or similar), excluded from the auth middleware matcher (already excludes `api/`)
- New Vercel production env vars: warm user email/password, shared warmup secret
- New Supabase Auth user + group (manual, one-time, in the same Supabase project as production)
- cron-job.org: new job pinging the new endpoint (manual, external, by the user)
- No changes to `/stock-items` itself or to middleware
