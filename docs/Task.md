# AskSight Product Completion Tasks

**Review date:** 18 October 2026  
**Scope:** Complete the React Native/Expo mobile product and the FastAPI backend described in the PRD.

## Backend audit

The backend currently provides an account-authentication foundation:

- `POST /auth/signup` validates name, email, and password; normalizes email; hashes passwords with `pwdlib`; rejects duplicate emails.
- `POST /auth/login` verifies the password and returns an HS256 JWT access token with a 30-minute expiry.
- `GET /auth/me` validates the bearer token and returns the matching user without exposing the password hash.
- FastAPI connects and disconnects the shared Prisma client through application lifespan hooks.
- The Prisma schema currently contains only `User` with a unique email. There are no image, Q&A, session, or model records.
- The app registers only the authentication router. There is no health/readiness endpoint, image upload route, Q&A route, history route, model service, migrations, container setup, CI workflow, or deployment configuration in the backend tree.
- Authentication tests cover request validation, password hashing, duplicate users, token expiry, and unauthorized access. Ruff passed. Pytest collected 49 tests but stalled on the first TestClient signup test for more than 20 seconds; it was interrupted, so the suite result is unverified.

## Implemented foundations

- [x] FastAPI authentication endpoints for signup, login, and current-user lookup.
- [x] Password hashing and signed, expiring JWT access tokens.
- [x] Prisma PostgreSQL `User` model and shared client lifecycle.
- [x] React Native/Expo sign-up, sign-in, settings, and sign-out screens.
- [x] Mobile Home, History, and Settings screens and primary navigation.
- [x] Backend auth unit/API tests and mobile UI tests exist in the repository.

## Remaining work

### P0 - Build the core visual-answering product

- [ ] **Data model and persistence**
  - [ ] Define database records for image uploads, question-answer sessions, individual questions and answers, model version, timestamps, and consent/retention state.
  - [ ] Add owner relationships and indexes for per-user history queries.
  - [ ] Create and document database migrations for the new records.
  - [ ] Add repository/service functions for creating and retrieving owned records.
- [ ] **Image storage and upload API**
  - [ ] Choose local file storage for development and an object-storage target for production; document required configuration.
  - [ ] Generate opaque storage keys and prevent user-provided filenames from becoming filesystem paths.
  - [ ] Enforce JPEG/PNG decoding and content checks, a 10 MB upload limit, and useful validation errors.
  - [ ] Implement authenticated upload and image metadata endpoints with owner checks.
  - [ ] Add deletion and retention behavior for stored image files and their database records.
- [ ] **LLaVA-style model pipeline** (planned; not present in the current repository)
  - [ ] Create a model package with pinned dependencies, configuration, and setup documentation.
  - [ ] Select and document compatible pretrained CLIP vision-encoder and instruction-tuned language-model checkpoints, including licenses and hardware needs.
  - [ ] Implement image preprocessing and CLIP visual patch-embedding extraction; initially keep the vision encoder frozen.
  - [ ] Implement the projection connector from CLIP embedding dimensions to the language model hidden dimension.
  - [ ] Define the prompt format that combines projected visual tokens with the user's question.
  - [ ] Prepare a reproducible VQA v2 data pipeline with separate train, validation, and held-out test splits.
  - [ ] Train the projection connector using the selected loss and versioned training configuration; keep the language model frozen for the initial plan.
  - [ ] Save and load versioned connector checkpoints and model/config metadata.
  - [ ] Implement one-time model loading and configurable CPU/GPU device selection.
  - [ ] Add inference that accepts a validated image and question and returns generated answer text.
  - [ ] Evaluate on held-out VQA v2 data and record standard VQA accuracy, latency, and known limitations.
- [ ] **Question-answer API and response behavior**
  - [ ] Define and version request and response schemas, including answer text, request ID, and model version.
  - [ ] Implement an authenticated endpoint that accepts an owned image and a bounded question.
  - [ ] Connect the endpoint to the inference service and persist the question, answer, and model version.
  - [ ] Return clear errors for missing images, invalid questions, timeouts, and model unavailability.
  - [ ] Add uncertainty behavior that asks the user to retry or clarify instead of presenting unsupported claims as certain.
- [ ] **Native camera and photo selection**
  - [ ] Select Expo-compatible camera and photo-library modules and add required platform configuration.
  - [ ] Request camera/library permissions with accessible explanations and recovery when denied.
  - [ ] Add capture, photo selection, image preview, retake, and cancel flows.
  - [ ] Add accessible upload progress, failure feedback, and retry behavior.
  - [ ] Connect the Home camera action to the capture/selection flow and upload API.
- [ ] **Answer experience and voice**
  - [ ] Build an answer screen showing the submitted image, question, and generated answer.
  - [ ] Add loading, retry, offline, timeout, and service-error states.
  - [ ] Add accessible controls to ask another question and return Home.
  - [ ] Select a mobile-compatible speech-to-text implementation and document platform requirements.
  - [ ] Connect microphone permission, listening state, transcript review, and typed-question fallback.
  - [ ] Select a mobile-compatible text-to-speech implementation and add replay/stop controls.
  - [ ] Announce important state changes to VoiceOver and TalkBack.
- [ ] **Core flow verification**
  - [ ] Add API tests for image validation, upload limits, authorization, and ownership isolation.
  - [ ] Add model-service tests using a small fixture or mocked model so tests do not require downloading full checkpoints.
  - [ ] Add mobile tests for capture/selection, upload states, question entry, and answer rendering.
  - [ ] Add end-to-end coverage for registration/sign-in, image upload, authorized Q&A, and invalid/expired sessions.

### P1 - Make accounts, history, and operations production-ready

- [ ] **Session security and route access**
  - [ ] Choose secure device storage for access tokens and document platform behavior.
  - [ ] Persist and retrieve the token securely; attach it to protected API requests.
  - [ ] Clear local session data on sign-out and handle expired/invalid tokens by returning to sign-in.
  - [ ] Decide whether refresh tokens are required for the intended session experience; document expiry and revocation behavior.
  - [ ] Protect authenticated routes and define direct-navigation behavior for signed-out users.
- [ ] **History and data lifecycle**
  - [ ] Implement an authenticated, paginated history list endpoint scoped to the current user.
  - [ ] Implement an authenticated history detail endpoint with ownership checks.
  - [ ] Add delete behavior and enforce the selected retention policy for records and image files.
  - [ ] Explain image and question storage and obtain consent before saving user content.
  - [ ] Connect Recent Activity and History screens to the API.
  - [ ] Add loading, empty, offline, pagination, deletion, and error states to the mobile UI.
- [ ] **Backend readiness and environment setup**
  - [ ] Add a liveness endpoint and a readiness endpoint that checks database connectivity.
  - [ ] Ensure health responses and logs do not expose secrets or sensitive image/question content.
  - [ ] Document database provisioning and migration commands.
  - [ ] Add `.env.example` entries for `DATABASE_URL` and `JWT` without real credentials.
  - [ ] Check tracked files and history for accidental production secrets.
- [ ] **Security and account lifecycle**
  - [ ] Add rate limits and request time/size limits for signup, login, uploads, and inference.
  - [ ] Bound all user-controlled text and validate uploaded image content server-side.
  - [ ] Audit authorization on every user-owned record and file operation.
  - [ ] Define safe logging and image metadata handling; avoid logging user content.
  - [ ] Define production HTTPS and JWT secret rotation procedures.
  - [ ] Decide whether email verification, password reset/change, and account deletion are launch requirements.
  - [ ] Implement the selected account lifecycle flows and cover them with tests.
- [ ] **Automated quality checks**
  - [ ] Add real-PostgreSQL integration test setup and teardown.
  - [ ] Diagnose and fix the current TestClient signup-test stall.
  - [ ] Confirm the backend test suite completes reliably from a clean environment.
  - [ ] Add CI jobs for backend lint and tests.
  - [ ] Add CI jobs for mobile lint, type checking, tests, and platform build checks.
- [ ] **Deployment and operations**
  - [ ] Add deployment configuration for the API and database connection.
  - [ ] Document environment variables and secret provisioning.
  - [ ] Configure database backups and test a restore procedure.
  - [ ] Add service and inference monitoring with actionable, privacy-safe logs.
  - [ ] Document deployment, migration, rollback, and incident recovery steps.

### P2 - Evaluation and release readiness

- [ ] **Model evaluation and performance**
  - [ ] Document VQA v2 dataset setup and the exact held-out evaluation procedure.
  - [ ] Publish the selected checkpoint, data split, configuration, and held-out metric for each evaluation run.
  - [ ] Benchmark model latency on target server hardware and define a baseline.
  - [ ] Measure end-to-end spoken-question-to-spoken-answer latency on supported devices.
  - [ ] Evaluate behavior on blurry, dark, obstructed, and otherwise low-quality images.
  - [ ] Document model limitations and examples where users should verify an answer.
- [ ] **Accessibility and device validation**
  - [ ] Audit primary flows with VoiceOver on iOS and TalkBack on Android.
  - [ ] Run usability sessions with blind and low-vision users and record findings.
  - [ ] Fix critical accessibility issues and retest affected flows.
  - [ ] Verify camera, microphone, keyboard, text scaling, safe areas, and connectivity on supported devices.
- [ ] **App release preparation**
  - [ ] Configure app name, bundle identifiers, icons, splash screen, and permission explanations.
  - [ ] Configure and verify development and production API URLs.
  - [ ] Create signed iOS and Android release builds.
  - [ ] Document store submission, support, and update procedures.
- [ ] **Developer documentation**
  - [ ] Update the root README with React Native/Expo architecture and setup steps.
  - [ ] Document backend setup, database migrations, and authentication flow.
  - [ ] Clearly list implemented features, known limitations, and remaining product work.

## Completion criteria

AskSight is ready for its initial product release when all P0 tasks are complete, all P1 security and operations tasks required for the intended deployment are complete, backend and mobile CI pass, and the accessibility and end-to-end checks have been performed on iOS and Android. P2 evaluation and distribution tasks should be completed before a broad public release.
