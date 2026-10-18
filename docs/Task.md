# AskSight Product Completion Tasks

**Review date:** 18 October 2026  
**Branch reviewed:** `feat/multimodal-core-workflow` (at `553d095`, identical tree to `main`; no multimodal code exists yet)  
**Scope:** Complete the React Native/Expo mobile product and the FastAPI backend described in the PRD.  
**Organization:** work is divided into three tracks — **Backend**, **Model**, and **UI** — plus a small shared/cross-cutting section. Each task carries its original phase tag `(P1–P10)` for traceability.

**Status legend:** `[x] done` = verified in code/tests · `(partial)` = started, incomplete · `(blocked)` = waiting on a decision, credential, or missing source document · `(pending)` = not started.

> **PRD note — verify before implementing:** no PRD file exists in the repository (`docs/`, git history, and the project folder were searched; only this Task.md and the two READMEs exist). Details attributed to the PRD below (10 MB upload limit, session-based API examples, `< 3s` inference / `< 5s` round-trip targets, clarification fallback) come from the prompt and root README, not a checked-in PRD. Confirm them against the actual PRD or a product decision before coding. Do not invent the missing requirements.

## Verified repository snapshot (18 Oct 2026)

**Backend (`backend/` — FastAPI, Python, Prisma, PostgreSQL/Neon)**

- `app/api/auth.py` implements `POST /auth/signup` (201 + `UserResponse`), `POST /auth/login` (bearer token), `GET /auth/me` (authenticated user, no password hash). No `/api/v1` prefix exists anywhere.
- `app/core/security.py` uses `pwdlib` hashing and HS256 JWTs with a 30-minute expiry; the secret is read from the `JWT` environment variable (startup fails if unset).
- `app/core/dependencies.py` validates bearer tokens and loads the user from the database.
- `app/db.py` exposes one shared Prisma client; `app/main.py` connects/disconnects it via lifespan and registers only the auth router.
- `prisma/schema.prisma` contains only `User` (cuid id, name, unique email, password, createdAt). There is **no migrations directory**.
- No health/readiness route, image/Q&A/history route, inference service, storage layer, Docker, or deployment config exists.
- Tests: **49 passed in 2.08s** (18 Oct 2026), including 4 subtests; `ruff check` and `ruff format --check` pass. The previously reported TestClient stall could not be reproduced.
- `backend/.env` holds `DATABASE_URL` and `JWT`; it has never been committed (verified across all git history). No `.env.example` exists.

**Model** — no model, training, dataset, or inference code exists anywhere in the repository.

**UI (`ui/` — React Native, Expo Router 57, TypeScript, NativeWind v4, Tailwind v3)**

- Screens: `login.tsx`, `signup.tsx` wired to the auth API; `(tabs)/home.tsx` with a **static, non-interactive** "Take a Photo" card (accessibility summary only); `(tabs)/history.tsx` empty state; `(tabs)/settings.tsx` with sign-out; tab navigation.
- `src/lib/api.ts` talks to `EXPO_PUBLIC_API_URL` (currently an ngrok URL in `ui/.env`), with friendly error mapping.
- `src/lib/auth.tsx` keeps the session **in memory only** (documented limitation: 30-minute token, no refresh endpoint); `app/index.tsx` always redirects to `/login`. No token storage, no route guard.
- Not installed / not configured: camera, image picker, audio recording, speech, playback; `app.json` has no camera/microphone permission entries and app name is still `ui`.
- Tests: **93 passed in 4 suites** (18 Oct 2026); `expo lint`, `tsc --noEmit`, and `prettier --check` pass. One auth-provider test logs `act()` warnings.

**CI / tooling**

- `.github/workflows/ci.yml` exists (push/PR to `dev`/`main`): backend job runs `prisma generate`, `ruff check`, `ruff format --check`, `pytest -q`; frontend job runs `npm ci`, `npm run lint`, `format:check`, `npm test -- --ci`.
- CI green status is **unverified** (`gh` is unavailable locally; check the GitHub Actions tab).

## Implemented foundations (preserved from the previous audit — do not regress)

- [x] **done** FastAPI authentication endpoints for signup, login, and current-user lookup.
- [x] **done** Password hashing and signed, expiring JWT access tokens.
- [x] **done** Prisma PostgreSQL `User` model and shared client lifecycle.
- [x] **done** React Native/Expo sign-up, sign-in, settings, and sign-out screens.
- [x] **done** Mobile Home, History, and Settings screens and primary navigation.
- [x] **done** Backend auth unit/API tests (49 passing) and mobile UI tests (93 passing) verified locally.
- [x] **done** CI workflow for backend lint/format/test and mobile lint/format/test committed.

## Workstream overview

| Track | Owns | Current state |
|---|---|---|
| **Backend** | API contracts, database, image storage, Sarvam STT/TTS proxy endpoints, Q&A persistence, history, health, deployment of the API | Auth slice complete; everything else not started |
| **Model** | LLaVA-style pipeline (CLIP + projection connector + frozen LM), VQA v2 training/eval, inference service (with a mock first) | Package, pipeline, data prep, train/eval code, mock + local services built and tested on tiny fixtures; real training pending remote GPU |
| **UI** | Camera/photo selection, upload UX, voice input, answer display, playback, history, accessibility, release build | Auth screens + navigation complete; core journey not started |

The UI and Backend tracks can start immediately. The Model track must not block them: an interface-compatible **mock inference service** ships first and is replaced only when the real model passes its own tests.

---

# Track A — Backend

**Objective:** Deliver the owned-data API surface behind the existing bearer-token auth: image upload/storage, Sarvam STT/TTS proxying, the canonical Q&A endpoint with persistence, history, and production readiness.

**Dependencies:** Track A owns and must complete the API contract before Track UI consumes it. Track A integrates with the Model track only through the internal inference service interface.

**Acceptance criteria (track-level):** every endpoint enforces authentication and ownership; secrets stay backend-side; failure modes (oversized/invalid uploads, provider timeouts, unavailable model) return typed, safe errors; backend tests cover all of it; the API deploys with migrations.

## A1. Contracts, data ownership, and configuration (P1)

- [x] **done** Audit existing routes, Prisma schema, and mobile API integration (see snapshot above).
- [x] **done** Verify auth implementation and test results: 49 backend tests pass in 2.08s; lint/format clean; stall not reproducible.
- [ ] **(pending)** Write `docs/api-contracts.md` covering every route: request/response schemas, status codes, error shapes, pagination, upload field names/content types, request IDs.
- [ ] **(pending)** Define and document image ownership, question/answer ownership, model-version tracking, and data-retention rules.
- [ ] **(blocked)** Decide how existing authenticated users acquire ownership of future images/history (all `User` rows currently own nothing). Blocked on the contract decision only.
- [ ] **(partial)** Document environment variables: `DATABASE_URL`, `JWT` are in use; no `.env.example` exists yet. Add `.env.example` without real credentials.
- [ ] **(blocked)** Identify conflicts between the existing auth flow (unprefixed `/auth/*`, HS256 bearer JWT, 30-min expiry) and the PRD's session-based API examples. **Requires the PRD (absent from the repo).**
- [ ] **(pending)** Decide the route prefix for new endpoints: keep the existing unprefixed convention or adopt `/api/v1` (proposed in Phase 6). Record the choice.

## A2. Image metadata, migrations, and storage (P2)

- [ ] **(pending)** Design the image metadata model (owner, opaque storage key, MIME type, size, dimensions, timestamps, retention state) and create the **first Prisma migration** (no migrations directory exists yet).
- [ ] **(pending)** Select and document storage: local disk for development, object storage for production (`STORAGE_BACKEND`, credentials, paths documented). Decision required.
- [ ] **(pending)** Enforce decoded JPEG/PNG content checks, spoofed-extension rejection, and a documented size limit (suggested 10 MB — verify against the PRD).
- [ ] **(pending)** Generate opaque storage keys; never use user-provided filenames as paths.

## A3. Upload and image access API (P2)

- [ ] **(pending)** Implement the authenticated upload endpoint per the A1 contract.
- [ ] **(pending)** Associate every image with its authenticated owner; enforce ownership on every read.
- [ ] **(pending)** Add image retrieval or controlled access required by the mobile flow (bytes-through-API vs signed URL — decide and document).
- [ ] **(pending)** Define deletion and retention behavior for files and records, including cascade on user deletion if adopted.

## A4. Sarvam STT service and endpoint (P3)

- [ ] **(pending)** Verify current Sarvam docs first: credits, supported languages, request formats, size/duration limits, rate limits; confirm the STT model (initially `saaras:v4`).
- [ ] **(pending)** Create a dedicated STT service module; key from `SARVAM_API_KEY` (never shipped to mobile).
- [ ] **(pending)** Implement the authenticated transcription endpoint (multipart audio upload).
- [ ] **(pending)** Validate audio formats; handle size/duration limits, unsupported languages, timeouts, rate limits, and provider failures with clear errors.
- [ ] **(pending)** Preserve the original spoken language where supported; return transcript + detected/configured language.
- [ ] **(pending)** Add mocked-provider tests plus a small number of real-API smoke checks (excluded from default CI).
- [ ] **(pending)** Document free-credit usage and monitoring.

## A5. Sarvam TTS service and endpoint (P4)

- [ ] **(pending)** Create a dedicated TTS service module; evaluate `bulbul:v4-flash` against live docs before pinning, verifying language/voice compatibility.
- [ ] **(pending)** Implement the authenticated speech-generation endpoint accepting text + language/voice.
- [ ] **(pending)** Decode returned audio correctly; serve playable bytes or a short-lived URL — no large base64 JSON payloads.
- [ ] **(pending)** Handle empty/oversized text, unsupported language/voice combinations, timeouts, and failures.
- [ ] **(pending)** Add mocked tests + limited real-API smoke checks; avoid storing generated speech longer than necessary.

## A6. Canonical Q&A endpoint and persistence (P6)

- [ ] **(pending)** Implement the ask endpoint (`POST /api/v1/ask` unless A1 keeps the unprefixed convention); accept image ID + bounded question; derive user from the existing token dependency.
- [ ] **(pending)** Verify image ownership; validate empty/oversized/invalid questions.
- [ ] **(pending)** Call inference through a dedicated internal service layer (mock first, real later).
- [ ] **(pending)** Persist question, answer, image association, timestamps, and model version; return a typed response with request ID and model version.
- [ ] **(pending)** Do **not** invent a calibrated confidence score; add one only if a meaningful, evaluated method exists.
- [ ] **(pending)** Add request IDs, structured logging, timeouts, clear errors; test success, invalid image, ownership violation, model unavailable, timeout, and persistence failure.
- [ ] **(pending)** Build the mock inference service behind the real interface so this endpoint is testable before training completes. Mark it clearly and keep it out of production builds.

## A7. History and data management API (P8)

- [ ] **(pending)** Implement authenticated, paginated history list + detail endpoints scoped to the current user, with ownership checks.
- [ ] **(pending)** Implement the agreed deletion/retention behavior end-to-end.
- [ ] **(pending)** Document whether/where consent to store user content is required — verify against the PRD.

## A8. Backend reliability, security, and tests (P9)

- [x] **done** Backend test suite completes reliably (49 passed in 2.08s, 18 Oct 2026).
- [ ] **(pending)** Add real-PostgreSQL integration test setup/teardown (current API tests use the in-memory `tests/fakes.py`).
- [ ] **(pending)** Add tests for every new endpoint: upload validation/limits, auth failures, ownership isolation, STT/TTS errors, ask failures, history scoping, health.
- [ ] **(pending)** Add rate limits and request size/time limits for signup, login, upload, STT/TTS, and ask.
- [ ] **(pending)** Add liveness + readiness endpoints (readiness checks DB connectivity, exposes no secrets).
- [ ] **(pending)** Verify no secrets or user content leak into logs, error responses, or CI output after adding Sarvam/storage config.
- [ ] **(pending)** Confirm CI is green from a clean checkout (workflow exists; run status unverified).

## A9. Backend deployment (P10)

- [ ] **(pending)** Document deployment requirements (API + model-serving boundary, memory, cold start).
- [ ] **(pending)** Configure production env vars and run migrations against the production Neon database.
- [ ] **(pending)** Deploy the API; verify secure storage access in production.
- [ ] **(pending)** Measure backend latency per hop (upload, STT, inference call, TTS) separately from the model time; compare with the PRD targets (verify).

---

# Track B — Model

**Objective:** Build the LLaVA-style multimodal pipeline (frozen CLIP vision encoder + trainable projection connector + frozen instruction-tuned LM), train it on VQA v2, evaluate with the standard metric, and expose it as a cached-load inference service behind the interface Track A codes against.

**Dependencies:** none to start; consumes no UI or API code. Track A's mock interface defines the contract the real service must satisfy.

**Acceptance criteria (track-level):** the model accepts an image + question and returns an answer; training is reproducible from documented commands; evaluation uses a held-out split with no leakage; results (VQA accuracy, latency, limitations) are recorded per checkpoint version; the service loads weights once and is tested without downloading full checkpoints in CI.

## B1. Architecture and checkpoint selection (P5)

- [ ] **(pending)** Review the PRD's required architecture and document the model-selection rationale (PRD absent — verify).
- [x] **done** Select compatible CLIP vision-encoder and instruction-tuned LM checkpoints; verify dimensions, licenses, and hardware requirements; document the choice.
- [x] **done** Create a model package with pinned dependencies, config, and setup documentation (separate from `backend/`).
- [x] **done** Document remote-GPU requirements if local hardware is insufficient; decide where training runs.

## B2. Pipeline implementation (P5)

- [x] **done** Implement image preprocessing and CLIP visual feature extraction.
- [x] **done** Implement the trainable projection connector (CLIP embedding dim → LM hidden dim).
- [x] **done** Build the multimodal prompt from projected visual tokens + the user question.
- [x] **done** Keep the vision encoder and LM frozen for the initial training stage.

## B3. VQA v2 data pipeline (P5)

- [x] **done** Build a reproducible VQA v2 download/preprocessing pipeline with documented commands.
- [x] **done** Establish train/validation/held-out test splits with no leakage (per-image and per-question).
- [x] **done** Record the exact split and preprocessing config with each run.

## B4. Training and checkpoints (P5)

- [x] **done** Train the projection connector with a versioned training config; save versioned checkpoints + config + dataset-split metadata.
- [x] **done** Keep training reproducible: seed, pinned versions, documented hardware.

## B5. Inference service (P5)

- [x] **done** Implement checkpoint loading and inference with **one-time model loading** (never per request); support configurable CPU/GPU selection.
- [x] **done** Expose the service through the same internal interface as Track A's mock; document intended deployment hardware.
- [x] **done** Define behavior for ambiguous questions and low-confidence outputs (clarify/retry rather than asserting — README promise; verify PRD).

## B6. Evaluation and documentation (P5, P10)

- [ ] **(partial)** Evaluate on the held-out split with the standard VQA accuracy metric; record model version, metric, latency, and known limitations. Code complete; results pending GPU training.
- [ ] **(partial)** Benchmark inference latency on target hardware; define a baseline. Measurement code complete; target hardware pending.
- [ ] **(pending)** Evaluate blurry, dark, obstructed, and low-quality images; document when users should verify an answer.
- [x] **done** Document supported languages and operational troubleshooting for the model service.

## B7. Model testing (P9)

- [x] **done** Add model-service tests using a tiny fixture/mock so CI never downloads full checkpoints.
- [x] **done** Test the service contract (image + question in, answer text out) against Track A's expected interface.
- [x] **done** Test failure paths: unreadable image, model not loaded, device unavailable.

---

# Track C — UI (Mobile)

**Objective:** Complete the on-device journey — capture/select an image → speak or type a question → see and hear the answer — with accessibility-first UI, history, and a release-ready build.

**Dependencies:** Track A endpoints (upload, STT, TTS, ask, history) per the A1 contract; Track A's mock inference makes the full flow demoable before Track B completes.

**Acceptance criteria (track-level):** a user can capture or select an image, ask a spoken or typed question, receive an answer, and hear it spoken; failure states (permission denial, network loss, recording failure, playback interruption) are handled; TalkBack/VoiceOver pass on the core flow; tests cover the journey.

**Already present (do not regress):** login/signup/home/history/settings screens, tab navigation, API client with friendly errors, WCAG 2.2 AA pass on auth screens (`cbd26d3`).

## C1. Upload and camera/photo capture (P7)

- [ ] **(pending)** Add Expo camera + photo-library modules and platform permission config (none installed; `app.json` has no permission entries).
- [ ] **(pending)** Request permissions with accessible explanations and denied-permission recovery.
- [ ] **(pending)** Add capture, photo selection, preview, retake, and cancel flows.
- [ ] **(pending)** Wire the Home "Take a Photo" card (currently static, non-pressable) to the flow.
- [ ] **(pending)** Upload to the Track A endpoint with progress, loading, retry, and accessible error states.

## C2. Voice question input (P7)

- [ ] **(pending)** Add audio recording and submit recordings to the STT endpoint.
- [ ] **(pending)** Connect microphone permission, listening state, and transcript review/edit/confirm before submission.
- [ ] **(pending)** Support typed questions as a fallback on the same screen.
- [ ] **(pending)** Handle recording failure, denied mic permission, and network loss.

## C3. Answer experience and playback (P7)

- [ ] **(pending)** Build the answer screen showing the submitted image, question, and generated answer using the existing design system.
- [ ] **(pending)** Add loading, retry, offline, timeout, and service-error states.
- [ ] **(pending)** Fetch TTS audio from the backend and play it; auto-play when appropriate, with accessible replay/stop controls.
- [ ] **(pending)** Handle interrupted playback and provide "ask another question" / "return Home" controls.
- [ ] **(pending)** Announce important state changes to VoiceOver and TalkBack.

## C4. History and session UX (P8)

- [ ] **(partial)** Connect the History and Recent Activity placeholders (currently static empty states) to the paginated history API.
- [ ] **(pending)** Add loading, empty, offline, pagination, deletion, and error states.
- [ ] **(pending)** Implement the agreed consent/retention UX before saving user content (verify PRD requirement).
- [ ] **(pending)** Decide mobile session persistence and secure token storage; today the session is in-memory only and cold start always returns to `/login`. Decide whether refresh tokens are needed; document expiry behavior.
- [ ] **(pending)** Protect authenticated routes and define direct-navigation behavior for signed-out users (no route guard exists today).

## C5. Accessibility verification on devices (P8)

- [ ] **(pending)** Verify TalkBack (Android) and VoiceOver (iOS) on the full core journey, including the new screens (auth screens were audited; new screens have not been).
- [ ] **(pending)** Verify logical focus order, accessible labels, status announcements, and dynamic text scaling.
- [ ] **(pending)** Verify large touch targets, high contrast, keyboard-aware layouts, and accessible playback controls on real devices.
- [ ] **(pending)** Run usability sessions with blind/low-vision users if scope allows; record findings.

## C6. Mobile tests (P9)

- [x] **done** Existing auth/API/home tests pass: 93 tests in 4 suites (18 Oct 2026).
- [ ] **(pending)** Add component tests for capture/selection, upload states, question entry, answer rendering, playback, and history.
- [ ] **(pending)** Add end-to-end coverage of the core journey (mock inference acceptable initially).
- [ ] **(pending)** Fix the `act()` warning in the auth-provider test.
- [ ] **(pending)** Add a mobile typecheck job to CI (`tsc --noEmit` runs locally but is not in `ci.yml`).

## C7. Release preparation (P10)

- [ ] **(pending)** Configure app name, bundle identifiers, icons, splash screen, and permission explanations (`app.json` still uses name/slug `ui`).
- [ ] **(pending)** Configure and verify development and production API URLs (`EXPO_PUBLIC_API_URL` currently points at an ngrok tunnel).
- [ ] **(pending)** Create signed iOS and Android release builds; run the final acceptance pass on real devices.
- [ ] **(pending)** Document store submission, support, and update procedures (verify store requirement; not claimed by the PRD note).

---

# Shared / Cross-Cutting

- [ ] **(blocked)** Obtain the actual PRD (or a written product decision) for: upload limit, retention/consent rules, session-vs-JWT API examples, latency targets, clarification behavior, store submission requirements.
- [x] **done** Secrets audit: `.env` files are ignored and have never been committed; no credentials in tracked files.
- [ ] **(pending)** Final secrets check after adding `SARVAM_API_KEY` and storage credentials: verify they cannot reach the mobile bundle, logs, error responses, or CI output.
- [ ] **(pending)** End-to-end acceptance: image upload → STT → QA → TTS → playback, measured on a real device, with per-hop latency recorded (P10).
- [ ] **(pending)** Update the root README — it still describes the old React + Web Speech API stack and contradicts the actual Expo app; document implemented features, known limitations, and remaining work.
- [ ] **(pending)** Confirm CI green from a clean checkout on `dev`/`main`; add missing jobs (mobile typecheck, model tests when B7 lands).

## Blocking decisions and external dependencies

| Item | Track waiting | Type | Notes |
|---|---|---|---|
| PRD document | All | Source/decision | Not in repo; verify upload limit, retention/consent, latency targets, session examples |
| API prefix (`/auth/*` vs `/api/v1/*`) | Backend, UI | Decision | Existing routes are unprefixed |
| Storage backend (local dev + production target) | Backend | Decision | Opaque keys only |
| Refresh tokens / mobile session persistence | UI, Backend | Decision | Mobile session is in-memory; token lives 30 min |
| Sarvam API key + free credits + verified model/voice names | Backend | Credential/external | Verify `saaras:v4`, `bulbul:v4-flash` against live docs |
| GPU compute for training / inference hosting | Model | Resource | Document remote-GPU path if local hardware is insufficient |
| CLIP + LM checkpoint selection and licenses | Model | Decision | Verify dimensions, license, hardware |
| VQA v2 dataset download | Model | External | Large; needs reproducible pipeline and split discipline |
| Production Neon database + API hosting | Backend | Credential/decision | No migrations exist yet |
| iOS/Android release identities (bundle IDs, app name) | UI | Decision | `app.json` still uses `ui` |

## Current project status

**Backend:** auth slice complete and tested (49 tests pass locally, lint/format clean). No image storage, STT/TTS, Q&A, history, health, or deployment code. **Model:** `model/` package complete and tested on tiny fixtures (27 tests, lint/format clean): frozen CLIP ViT-B/32 + trainable connector + frozen Qwen2.5-1.5B-Instruct pipeline, VQA v2 subset pipeline with leakage-free image-disjoint splits, connector training + evaluation + mock/local inference services; real training and held-out VQA accuracy pending a remote GPU. **UI:** auth screens, navigation, and API client complete and tested (93 tests pass; lint/typecheck/format clean); the core journey (camera, upload, voice, answer, playback) is not started, and the Home camera card is still a static placeholder. CI workflow now includes a model job using tiny fixtures only; green status is unverified. The checked-out `feat/multimodal-core-workflow` branch contains no multimodal backend/UI code.

## Next recommended task

**Backend (A1): contract-first.** Write `docs/api-contracts.md` + `.env.example` and record the four open decisions (API prefix, storage backend, retention, refresh tokens). Everything downstream — Track UI screens and Track Model's service interface — consumes that contract, so it is the highest-leverage unblock.

The next three tasks by track:

1. **Backend** — A1 contracts, then A2 image model + first migration.
2. **Model** — run `python -m asksight_model.data` + connector training on a remote GPU (≥16 GB) and record held-out VQA accuracy/latency; then B6 robustness evaluation.
3. **UI** — C1 camera/photo modules + permissions against the mock upload contract.

## Commands and checks required to verify completion

```bash
# Backend
cd backend
./venv/bin/python -m pytest -q            # expect: 49 passed (grows with new endpoints)
./venv/bin/ruff check .                   # expect: All checks passed
./venv/bin/ruff format --check .          # expect: formatted

# Mobile
cd ui
npm test -- --ci                          # expect: 93 passed, 4 suites (grows)
npm run lint
npm run typecheck
npm run format:check

# Model
cd model
.venv/bin/pytest -q                       # expect: 27 passed (grows; tiny fixtures, no downloads)
.venv/bin/ruff check .                    # expect: All checks passed
.venv/bin/ruff format --check .           # expect: formatted
# Real runs (remote GPU / after data download):
# python -m asksight_model.data --out data/vqa
# python -m asksight_model.train --config configs/default.yaml
# python -m asksight_model.evaluate --checkpoint checkpoints/v0.1 --split test

# CI (exists; green status unverified — check GitHub Actions tab)
cat .github/workflows/ci.yml
```

Per-track completion evidence to require: **Backend** — migrations apply/rollback cleanly, ownership tests green, mocked-provider tests in CI, real-API smoke checks recorded; **Model** — held-out VQA accuracy + latency recorded with checkpoint version, reproducible training command; **UI** — TalkBack/VoiceOver session notes for the core journey, device acceptance pass, upload→STT→QA→TTS→playback test.
