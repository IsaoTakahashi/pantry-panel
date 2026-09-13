## 1. Manual production setup (outside this repo, prerequisite for the endpoint to work — not a code-merge blocker)

- [x] 1.1 Create a dedicated warm-only user in the production Supabase project (Dashboard → Authentication → Add user, email+password, confirmed)
- [x] 1.2 Create a group for the warm user and add one seed stock item (via the backend API, same pattern as `frontend/e2e/global-setup.ts`'s ephemeral group creation), so the SSR render exercises a non-empty list
- [x] 1.3 Add `WARM_USER_EMAIL`, `WARM_USER_PASSWORD`, `WARM_GROUP_ID` (the group created in 1.2), `WARMUP_SHARED_SECRET` as Vercel production environment variables
- [x] 1.5 Add `WARM_TARGET_ORIGIN` (this app's own production URL, e.g. `https://pantry-panel-xi.vercel.app`) as a Vercel production environment variable — added after 1.3 during final review (fix for the request-derived-fetch-target finding; see design.md Decisions)
- [x] 1.4 Check Supabase Dashboard → Authentication → Rate Limits for the sign-in rate limit and confirm the module-cache approach (~1 sign-in/hour) stays well under it — confirmed 150 req/5min (1800/hr), comfortably above even a naive per-ping sign-in rate

## 2. Implementation (TDD)

- [x] 2.1 Write tests for the cookie-building helper (session → `sb-<ref>-auth-token` cookie value/chunks), reusing `@supabase/ssr`'s `createChunks`/`stringToBase64URL` the same way `frontend/e2e/global-setup.ts` does
- [x] 2.2 Implement the cookie-building helper
- [x] 2.3 Write tests for the module-scope session cache (fresh sign-in when empty, reuse when access token has remaining lifetime, refresh near expiry, fallback to fresh sign-in if refresh fails)
- [x] 2.4 Implement the session cache
- [x] 2.5 Write tests for `/api/warm/stock-items` route handler: rejects missing/invalid shared secret with 401 before any Supabase call; on valid secret, signs in/reuses session, fetches own `/stock-items` with `redirect: "manual"`, returns 200 only when the internal fetch is 200, returns non-200 (e.g. 502) when it's a redirect or error
- [x] 2.6 Implement the route handler
- [x] 2.7 Run `cd frontend && npx vitest run` and confirm all new and existing tests pass

## 3. Manual verification

- [ ] 3.1 After deploy, `curl -H "x-warmup-secret: <secret>" https://<vercel-app>/api/warm/stock-items` returns 200
- [ ] 3.2 `curl https://<vercel-app>/api/warm/stock-items` (no secret) returns 401
- [ ] 3.3 Add a new cron-job.org job (2-minute interval) targeting the endpoint with the shared-secret header configured
- [ ] 3.4 After ~1 hour of the cron job running, spot-check that repeated warm pings are not each triggering a fresh Supabase sign-in (e.g. via Supabase Dashboard auth logs, if available) — confirms the session cache is working as designed

## 4. Archive

- [ ] 4.1 Run `opsx:archive` to promote the delta spec into `openspec/specs/warmup-scheduler/spec.md` and archive this change
