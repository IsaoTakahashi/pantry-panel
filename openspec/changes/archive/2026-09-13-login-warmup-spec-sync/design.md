## Context

`openspec/specs/warmup-scheduler/spec.md` currently documents a GitHub Actions scheduled workflow hitting `/api/health` every 10 minutes. That workflow (`keep-warm.yml`) was deleted in PR #274 (Issue #273) because GitHub's public-repo scheduled workflows get silently throttled under load (observed: ran every 2-4 hours instead of every 10 minutes) and because the ping target at the time was itself a static-cached page that invoked no function. The replacement — external cron-job.org pings — was never reflected back into the spec.

The #273 fix repointed the ping at `/login`, verified at the time to return 200 directly. Re-measuring on 2026-09-12 shows `/login` now returns `x-vercel-cache: HIT` / `x-nextjs-prerender: 1` with no `x-matched-path`, and `age` grows 1:1 with wall-clock time across the 300s stale-time boundary with no revalidation observed — i.e. it is fully static-cached and invokes no Vercel function. `/api/health` was measured as a working alternative: `x-vercel-cache: MISS` and `x-matched-path: /api/health` on every request.

## Goals / Non-Goals

**Goals:**
- Make `warmup-scheduler` spec match the actual current mechanism (external cron-job.org, not GitHub Actions)
- State the retargeting decision (`/login` → `/api/health`) and the evidence behind it, so a future regression of this kind is easier to recognize
- Explicitly document the per-route function limitation so nobody assumes warming `/api/health` also warms `/stock-items`

**Non-Goals:**
- Actually reconfiguring cron-job.org (external dashboard, manual, performed by the user — not an artifact this repo can apply)
- Designing authenticated warmup for `/stock-items` (Issue #281, separate change)
- Re-adding any in-repo scheduling mechanism (GitHub Actions or otherwise) — cron-job.org remains the delivery mechanism

## Decisions

- **Spec describes cron-job.org, not GitHub Actions.** The workflow-based requirement no longer matches reality post-#273/#274; keeping stale requirements in the spec risks a future change relying on a mechanism that doesn't exist.
- **Retarget to `/api/health` over other candidates.** Considered keeping `/login` and forcing it dynamic (e.g. removing whatever makes it static-eligible) — rejected because `/login` being static-cacheable is a legitimate, desirable perf property (instant, cold-start-immune for anonymous users); fighting that would trade away a real optimization to satisfy a warmup job. `/api/health` is already a dedicated, non-user-facing route with confirmed per-request function invocation, so it's a "does what it says" warmup target with no side effects on real traffic.
- **Do not claim this also warms `/stock-items`.** Per the established per-route function model, it doesn't. The spec states this limitation directly rather than leaving it implied, since the omission is exactly what let the `/login` regression go unnoticed.

## Risks / Trade-offs

- [Spec update alone doesn't fix production] → The actual cron-job.org retarget is a manual step outside this repo; this change only updates documentation. Mitigate by calling this out clearly in the proposal/tasks so it isn't mistaken for a complete fix.
- [`/api/health` could itself regress to static-cacheable later, repeating this exact failure mode unnoticed] → Documented as an explicit spec scenario (health endpoint must return non-cached, function-backed responses) so a future regression is at least a spec violation, not silent.
- [Warming `/api/health` gives no benefit to real user-facing latency] → Acceptable for this change's narrow scope (restore the warmup job to doing *something* real); the actual user-facing gap (`/stock-items`) is tracked in Issue #281.

## Migration Plan

1. Merge this spec-sync change to `main`.
2. User manually updates the cron-job.org job's Vercel-side target URL from `/login` to `/api/health`.
3. No rollback concerns: documentation-only change; the manual cron-job.org retarget can be reverted by pointing the URL back if needed.

## Open Questions

- None blocking. Issue #281 (`/stock-items` authenticated warmup) is intentionally out of scope here.
