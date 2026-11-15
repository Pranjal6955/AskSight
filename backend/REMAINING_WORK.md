# Backend Remaining Work

Only the work still outstanding is listed here. Completed authentication,
image storage, Q&A, history, speech, health, rate-limit, logging, migration and
test work is recorded in git history and [docs/api-contracts.md](../docs/api-contracts.md).

## Decisions needed

- [ ] Confirm production latency and availability targets.
- [ ] Confirm the production API host, PostgreSQL provider, and object-storage
  provider.

## Production deployment

- [ ] Provision production PostgreSQL (Neon or equivalent). Baseline the
  existing database once with
  `prisma migrate resolve --applied 20261111000000_init`, then run
  `prisma migrate deploy`; verify a fresh database needs only `migrate deploy`.
- [ ] Create the production S3 bucket and credentials, set
  `STORAGE_BACKEND=s3`, `STORAGE_S3_BUCKET`, and `STORAGE_S3_PREFIX`, then
  verify upload, read, and delete.
- [ ] Set production secrets (`DATABASE_URL`, `JWT`, `SARVAM_API_KEY`) on the
  host; keep them out of the repository, logs, and CI.
- [ ] Add and verify a production `backend/Dockerfile` (generating the Prisma
  client at build time) or an equivalent build recipe.
- [ ] Deploy the API and verify `/health/live`, `/health/ready` (database and
  model), and `/health/model`.
- [ ] Run one real upload → ask → history → delete smoke test against
  production.

## Provider and CI verification

- [ ] Run the opt-in Sarvam STT/TTS smoke tests with a real `SARVAM_API_KEY`;
  record the model names, supported languages, and response formats.
- [ ] Confirm CI is green from a clean checkout on `dev`/`main`.

## Performance and hardening

- [ ] Measure per-hop latency on production (upload, STT, inference,
  persistence, TTS) with `scripts/bench.py`; compare against the product
  targets.
- [ ] Move rate limiting out of process (for example Redis) before running more
  than one worker or host.
- [ ] After production secrets are added, re-check logs, error responses, and
  CI output for leaked credentials or user content.

## Documentation

- [ ] Update `docs/Task.md`; it still describes the pre-implementation state.
- [ ] Keep `docs/deployment.md` aligned with the final host, storage, and
  container setup.
