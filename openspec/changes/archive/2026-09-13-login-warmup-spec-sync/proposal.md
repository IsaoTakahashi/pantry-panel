## Why

`openspec/specs/warmup-scheduler/spec.md` still describes the GitHub Actions-based `/api/health` warmup job that was removed in Issue #273 / PR #274 (superseded by external cron-job.org pings). Meanwhile, production measurement on 2026-09-12 shows the current cron-job.org target (`/login`) is served entirely from Vercel's CDN cache (`x-vercel-cache: HIT`, `x-nextjs-prerender: 1`, no `x-matched-path`, `age` growing 1:1 with elapsed time across a stale-time boundary with no revalidation) — meaning the 2-minute ping invokes no Vercel serverless function at all. This is the same class of bug Issue #273 already fixed once (the old static `/health` page). By contrast, `/api/health` was measured to reliably invoke its function on every request (`x-vercel-cache: MISS`, `x-matched-path: /api/health`).

The spec needs to reflect reality (external cron-job.org pings, not GitHub Actions) and the actual warmup target needs to move to a route that verifiably invokes a function.

## What Changes

- Retarget the cron-job.org Vercel-side ping from `/login` to `/api/health` (external service config; no repo code change — the user performs this manually in the cron-job.org dashboard).
- Update `openspec/specs/warmup-scheduler/spec.md` to describe the actual current mechanism (cron-job.org external ping to `/api/health` every 2 minutes, plus a direct ping to the Lambda `/health` Function URL) instead of the removed GitHub Actions workflow.
- Document the known limitation explicitly in the spec: warming `/api/health` does not warm the `/stock-items` page's function, since Vercel allocates a separate function per route. Authenticated warmup for `/stock-items` is tracked separately in Issue #281.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `warmup-scheduler`: the delivery mechanism changes from a GitHub Actions scheduled workflow to an external cron-job.org ping, and the requirement is restated as "the ping must verifiably invoke a Vercel serverless function" (with the `/login` static-cache failure mode called out as a non-conforming case to avoid repeating).

## Impact

- `openspec/specs/warmup-scheduler/spec.md` (documentation only)
- cron-job.org dashboard configuration (external, manual, out of repo)
- No application code changes
