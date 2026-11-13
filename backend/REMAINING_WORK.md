# Backend Remaining Work

This document tracks the backend work required to move from the current
authentication and prototype visual-Q&A endpoint to a production-ready API.

## Current foundation

- Signup, login, JWT authentication, password hashing, and `/auth/me` exist.
- Refresh tokens with rotating, revocable sessions (`POST /auth/refresh`,
  `POST /auth/logout`).
- `POST /images` stores an owned image record behind a pluggable storage layer
  (local disk for development, S3-compatible object storage for production).
- `GET`/`DELETE /images/{id}` serve and remove bytes with ownership enforced.
- `POST /ask` takes an image id and a bounded question, verifies ownership,
  runs inference behind one service protocol, and persists the exchange.
- `GET /history` (keyset-paginated), `GET`/`DELETE /history/{id}`,
  `DELETE /history`.
- `/health/live` and `/health/ready` probes; request IDs and structured JSON
  access logs on every request.
- Prisma schema holds `User`, `Session`, `Image`, and `HistoryEntry` with the
  first migration generated.

## Product decisions (resolved)

- **Route prefix:** none. All routes stay unprefixed (`/auth/*`, `/ask`, …).
- **Upload limit / retention / consent:** 10 MB, JPEG/PNG only. Stored images
  and answers live **until the user deletes them** — no automatic expiry, no
  consent flag column (deletion endpoints are the consent mechanism; behavior
  is documented in `docs/api-contracts.md`).
- **Storage backends:** local disk for development (`STORAGE_BACKEND=local`),
  S3-compatible object storage for production (`STORAGE_BACKEND=s3`).
- **Image delivery:** raw bytes through the authenticated API, not signed URLs.
- **Refresh tokens:** yes — mobile clients get refresh tokens and persistent
  sessions, with rotation on every refresh.
- **Production latency, availability, deployment targets:** still open; needs
  an owner decision before the operations checklist below can be completed.

## Implementation checklist

### 1. API and configuration contract

- [x] Add `docs/api-contracts.md` with request, response, error, and
  authentication schemas.
- [x] Add a backend `.env.example` covering `DATABASE_URL`, `JWT`,
  `ASKSIGHT_MODEL_CHECKPOINT`, storage, Sarvam, logging, and environment
  settings.
- [x] Define a request-ID format and include it in responses and structured
  logs.
- [x] Use typed response schemas for every public endpoint.

### 2. Database and image storage

- [x] Add Prisma models and the first migration for image metadata:
  owner, opaque storage key, MIME type, byte size, dimensions, timestamps,
  and retention/deletion state. (Retention decision: no `expiresAt` columns;
  deletion is FK cascade plus the explicit delete endpoints.)
- [x] Add models for questions, answers, and their image/user relationships.
- [x] Add indexes for owner and timestamp-based history queries.
- [x] Implement a storage interface with a local-disk development backend.
- [x] Implement the production object-storage backend (S3 via boto3).
- [x] Never use an original filename as a storage path.
- [x] Validate decoded image content, MIME type, extension spoofing, size, and
  dimensions.
- [x] Define deletion, retention, and user-cascade behavior.

### 3. Upload and visual Q&A

- [x] Add an authenticated upload endpoint that creates an owned image record.
- [x] Add image retrieval/access with ownership enforcement.
- [x] Update `/ask` to accept an image ID and bounded question.
- [x] Verify image ownership before inference.
- [x] Persist question, answer, image association, timestamps, and model
  version.
- [x] Keep mock and real inference behind the same internal service protocol.
- [x] Handle model unavailable, timeout, invalid input, and persistence
  failures with explicit API errors (503 / 504 at 30 s / 422 / 500).

### 4. Sarvam speech services

- [ ] Verify current Sarvam STT/TTS model names, limits, supported languages,
  and response formats before implementation.
- [ ] Add a dedicated STT service using `SARVAM_API_KEY`.
- [ ] Add an authenticated multipart transcription endpoint.
- [ ] Validate audio format, duration, and size.
- [ ] Add a dedicated TTS service and authenticated speech-generation endpoint.
- [ ] Return playable audio bytes or a short-lived URL rather than large base64
  JSON responses.
- [ ] Handle provider timeouts, rate limits, unsupported languages/voices, and
  provider failures.
- [ ] Add mocked provider tests and opt-in real-provider smoke tests.

### 5. History and data management

- [x] Add authenticated, paginated history list and detail endpoints.
- [x] Scope every query to the authenticated user.
- [x] Add deletion endpoints and apply the agreed retention policy.
- [x] Document consent and user-content storage behavior.

### 6. Reliability, security, and operations

- [x] Add liveness and readiness endpoints; readiness must verify database
  connectivity without exposing secrets.
- [ ] Add rate limits and request/time limits for auth, uploads, STT, TTS, and
  inference. (Done for inference: `/ask` is capped at 30 s. The rest —
  especially rate limits — is open.)
- [x] Add structured logs with request IDs and no secrets or raw user content.
- [ ] Add PostgreSQL integration-test setup and teardown. (Unit/API tests run
  against an in-memory fake; a real-Postgres harness is still missing.)
- [x] Add endpoint tests for ownership isolation, provider failures, model
  failures, timeouts, persistence failures, and history pagination. (Voice
  provider tests land with section 4.)
- [ ] Confirm migrations apply cleanly from a fresh database.
- [ ] Document API/model service boundaries, memory requirements, cold starts,
  environment variables, and deployment steps. (`.env.example` covers the
  variables; the rest is open.)
- [ ] Configure production migrations, storage access, secrets, and API hosting.
- [ ] Measure upload, provider, inference, persistence, and total request
  latency separately.

## Verification

```bash
cd backend
./venv/bin/python -m pytest -q      # 150 tests, no network, no Postgres
./venv/bin/ruff check .
./venv/bin/ruff format --check .
```

Migration note: the current Neon dev database already contains the original
`User` table, so `prisma migrate deploy` there needs a one-time baseline
first — `prisma migrate resolve --applied 20261111000000_init` — then
future migrations apply normally. A fresh database only needs
`prisma migrate deploy`. (Baselining is documented here, not executed.)

## Completion criteria

The backend is ready when:

1. A user can upload an image, ask a question, receive an answer, and retrieve
   the saved interaction from history.
2. Every stored object and history record is ownership-scoped.
3. Mock providers run in CI and production providers have opt-in smoke tests.
4. Fresh PostgreSQL migrations and integration tests pass.
5. Health, readiness, limits, logging, deployment, and environment behavior are
   documented and verified.
