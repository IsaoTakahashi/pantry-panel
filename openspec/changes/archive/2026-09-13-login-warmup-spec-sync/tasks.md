## 1. Spec sync

- [x] 1.1 Verify `openspec/specs/warmup-scheduler/spec.md` has no other stale references to `keep-warm.yml` / GitHub Actions warmup beyond the two requirements this change replaces
- [x] 1.2 Confirm `specs/warmup-scheduler/spec.md` delta applies cleanly against the current base spec (no other change already modified the same requirements)

## 2. Manual production step (outside this repo, not a merge blocker)

- [x] 2.1 User retargets the cron-job.org Vercel-side ping from `/login` to `/api/health` in the cron-job.org dashboard
- [x] 2.2 After retargeting, verify with `curl -sD - -o /dev/null https://<vercel-app>/api/health` that responses show `x-matched-path: /api/health` and `x-vercel-cache: MISS` (or non-HIT) consistently — confirmed 3/3 consecutive requests

## 3. Archive

- [x] 3.1 Run `opsx:archive` to promote the delta spec into `openspec/specs/warmup-scheduler/spec.md` and archive this change
