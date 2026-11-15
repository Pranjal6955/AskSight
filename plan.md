# AskSight UI — Implementation Plan

**Companion to:** [design.md](design.md) (the spec — read that first)
**Scope:** the Expo mobile app in `ui/`, from today's auth-only shell to the full
low-vision journey.
**Status:** plan only; no core-journey code exists yet.

The order below is deliberate: foundations first so every later screen is born
accessible, then capture → ask → answer (the demo path), then history and
settings, then device verification and release.

---

## 0. Where the app is today

| Built and working | Missing |
|---|---|
| Sign-in / sign-up screens with WCAG 2.2 AA treatment | Session persistence (refresh token), route guard |
| Home, History (empty), Settings shell, floating tab bar | Camera, photo library, upload |
| API error mapper (`toFriendlyMessage`, `readError`) | STT, TTS, ask, image, history calls |
| Design tokens in `ui/tailwind.config.js` | Answer screen, playback, transcript review |
| 93 passing tests, lint + typecheck clean | Consent, delete flows, accessibility settings |
| — | Core-journey component/E2E tests, TalkBack/VoiceOver pass, release config |

Ground rules for every task:

- Follow `ui/AGENTS.md`: Expo SDK 57, Expo Router, `npx expo install`, check the
  versioned docs before touching an Expo API, run lint + typecheck before done.
- Do not regress the audited auth screens.
- Every new screen is designed for ears first (design.md §4), not retrofitted.
- Show backend `detail` sentences verbatim; never compose new technical errors.
- One dependency at a time, and only when the SDK does not already provide it.

---

## 1. Phases at a glance

| Phase | Goal | Main screens | Blocked by |
|---|---|---|---|
| 0 | Foundations: API client, session, settings, a11y toolkit, shared components | none | — |
| 1 | Capture a usable photo and upload it | Camera, Preview | Phase 0 |
| 2 | Ask by voice (typed fallback) | Ask, Transcript | Phase 0 (+ Phase 1 for a photo) |
| 3 | Hear and read the answer | Answer | Phase 2 |
| 4 | Revisit and delete history; first-run consent | History, Detail, Consent | Phase 3 |
| 5 | Accessibility settings and About | Settings | Phase 0 (usable after Phase 3) |
| 6 | Verification, tests, release build | all | Phases 1–5 |

Phases 1 and 2 can run in parallel once Phase 0 lands. Phase 5 can start any
time after Phase 0 because it only needs the settings store.

---

## 2. Phase 0 — Foundations

### 2.1 Expand the API client (`src/lib/api.ts`)

- [ ] Add types and functions: `TokenResponse` (access + refresh), `refresh`,
  `logout`, `uploadImage(file)`, `getImage(id)`, `ask(imageId, question)`,
  `transcribe(file)`, `synthesize(text, language, voice)`,
  `listHistory(cursor?)`, `getHistoryEntry(id)`, `deleteHistoryEntry(id)`,
  `deleteAllHistory()`, `deleteImage(id)`.
- [ ] Keep the one `request` helper for JSON, plus separate helpers for
  multipart (`FormData` with `{ uri, name, type }`) and binary responses.
- [ ] Attach `X-Request-ID` from the response to thrown errors for support.
- [ ] Map the new statuses (413, 415, 429, 502, 503, 504) to the copy in
  design.md §9, while still preferring the backend sentence.

**Done when:** unit tests cover every function's URL, method, headers, and
error mapping; no new `any`.

### 2.2 Session persistence (`src/lib/session.ts`, `src/lib/auth.tsx`)

- [ ] Install `expo-secure-store`; store only the **refresh token** there. Keep
  the access token in memory.
- [ ] On cold start: read the refresh token → `POST /auth/refresh` → `GET /auth/me`.
  Persist the rotated refresh token, discard the old one.
- [ ] On any 401: refresh once, retry the request once, then sign out with the
  "Your session has expired" message.
- [ ] Sign out: call `POST /auth/logout`, delete the stored token even if the
  call fails, clear state.
- [ ] Guard routes with `Stack.Protected` (SDK 57). `redirectTo` is SDK 58+ —
  use the anchor route; keep `app/index.tsx` redirecting to `/login` when
  signed out.
- [ ] Add an `authReady` loading state so the app does not flash the login
  screen while restoring.

**Done when:** a killed-and-reopened app lands on Home when the refresh token is
valid; an expired/revoked token lands on Login; tests cover refresh-once,
rotate, and sign-out.

### 2.3 Settings store (`src/lib/settings.tsx`)

- [ ] Context + persistence for: `speakAutomatically` (default on),
  `speechRate` (`0.8 | 1 | 1.2`), `textScale` (`system | large | xlarge`),
  `speechLanguage` (default `en-IN`), `consentGiven`.
- [ ] Persist as JSON in `expo-secure-store` (already installed for tokens; the
  payload is tiny) so no second storage dependency is added.
- [ ] Provide a `useSettings()` hook and a text-scale helper that multiplies the
  app's type sizes without overriding the OS scale.

**Done when:** values survive restart; changing text scale updates a preview
immediately and is announced.

### 2.4 Accessibility toolkit (`src/lib/a11y.ts`, `src/lib/useA11y.ts`)

- [ ] `announce(message, assertive?)` wrapper around
  `AccessibilityInfo.announceForAccessibility`.
- [ ] `useScreenReader()` from `AccessibilityInfo.isScreenReaderEnabled()` with
  a subscription, used to default auto-speak off.
- [ ] `useReduceMotion()` and `useHighContrast()` (platform-supported only).
- [ ] A small `describeDate(iso)` helper for spoken dates ("Today at 2:15 PM").
- [ ] Focus helpers: a ref-based `setAccessibilityFocus` for moving focus to the
  answer/primary action after a transition.

### 2.5 Shared components (`src/components/`)

- [ ] `ScreenHeader` — title as header, labelled back button.
- [ ] `ActionCard` — the Home "Take a Photo" pattern as a reusable one-button card.
- [ ] `StatusBanner` — info/success/warning/error, icon + text, no auto-dismiss;
  `accessibilityRole="alert"` for errors.
- [ ] `MicButton` — idle/listening/processing, 120–140 dp, tap-to-toggle,
  `accessibilityState.selected`, label swaps.
- [ ] `AnswerBlock` — answer text at 30–34 px, playback row, verify note.
- [ ] `HistoryRow` — combined label, 96 dp, question + 2-line answer + date.
- [ ] `ConfirmDialog` — names the consequence; destructive action not default.
- [ ] `ProgressAnnouncer` — announce start, 8 s "still working", finish.

**Done when:** each component has a test for its accessible label/state and a
Story-style render in the existing test setup (no Storybook dependency).

### 2.6 Test harness

- [ ] Shared test helpers for a signed-in `AuthProvider`, a fake API, and
  accessibility queries (`getByRole`, `getByLabelText`).
- [ ] Confirm the existing 93 tests still pass; fix no unrelated warnings.

---

## 3. Phase 1 — Capture and upload (C1)

- [ ] `npx expo install expo-camera expo-image-picker expo-haptics`.
- [ ] Add camera and photo-library permission copy to `app.json` config plugins
  (permission strings explain *why*, in plain language).
- [ ] `src/app/capture.tsx` (modal): full preview, bottom control bar, torch,
  whole-preview tap to capture, Close.
  - `CameraView` + `useCameraPermissions`; `takePictureAsync` with quality
    ~0.8 and a sane size.
  - Spoken guidance on entry only; announce torch and shutter.
- [ ] `src/app/photo-preview.tsx`: image, "Use Photo", "Retake", "Choose
  Another", upload progress on the primary button, spoken milestones after 3 s.
- [ ] Library path: `ImagePicker.requestMediaLibraryPermissionsAsync` then
  `launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8 })`.
- [ ] Wire Home's primary card and "Choose from Library" to the flows.
- [ ] Upload via `POST /images`; keep the returned `image_id` in navigation
  params. Handle 413/415/422/401/offline with design.md §7.4 copy.
- [ ] Denied permission: pre-permission explanation, then OS prompt; on denial
  show how to enable it and offer the library path.
- [ ] Guard double submission (disable while uploading; rate limit is 30/min).

**Done when:** a user can take a photo or pick one, see it, retry, and reach the
Ask screen with an `image_id`; TalkBack/VoiceOver can complete it with the
screen curtain on; tests cover permission denial, upload failure, retry, and
oversize.

Do **not** add client-side image resizing yet. Uploads are capped at 10 MB and
phone JPEGs are usually under it. Add compression only if real uploads are slow
or oversized.

---

## 4. Phase 2 — Ask by voice (C2)

- [ ] `npx expo install expo-audio`.
- [ ] `src/lib/useRecorder.ts`: permission check
  (`AudioModule.requestRecordingPermissionsAsync`), `useAudioRecorder` with
  `RecordingPresets.HIGH_QUALITY` (m4a is accepted by the backend), stop and
  return the file URI, 60 s auto-stop, cleanup on unmount.
- [ ] `src/lib/useSpeech.ts`: `useAudioPlayer` for TTS playback, `play(uri)`,
  `stop()`, `isPlaying`, audio-mode setup so it ducks/pauses other audio.
- [ ] `src/app/ask.tsx`: photo thumbnail, giant `MicButton` (tap to start/stop),
  timer, "Cancel recording", typed fallback field with 1–500 char limit and
  visible label, example chips that fill (not submit), "Ask" primary.
- [ ] Voice path: stop → `POST /stt` (multipart) → transcript screen.
- [ ] `src/app/transcript.tsx`: "Did we hear you right?", transcript text,
  "Ask This Question" primary, "Speak Again", "Edit". Announce the transcript,
  focus the primary action.
- [ ] Submit `POST /ask` with `{ image_id, question }`; navigate to Answer with
  the entry id and the answer payload.
- [ ] Errors: STT 503 (no key) → "Voice isn't available right now. You can type
  your question."; empty audio, unsupported format, 429; offline.
- [ ] Setting "send automatically after I stop speaking" (off by default) reads
  from the settings store but can be implemented as a disabled stub until Phase 5.

**Done when:** a recorded question becomes text, the user can confirm or edit,
and the app sends it; typed questions work with voice unavailable; tests cover
record → transcribe → confirm and transcription failure.

---

## 5. Phase 3 — Answer and playback (C3)

- [ ] `src/app/answer.tsx`: question recap, answer at 30–34 px, playback row
  ("Listen Again" / "Stop"), "Ask Another Question" / "New Photo", verify note,
  optional photo thumbnail.
- [ ] `POST /tts` with the answer text and chosen language; write the returned
  `audio/mpeg` bytes to `Paths.cache` with `expo-file-system`
  (`new File(Paths.cache, ...)`), play the file URI, delete it on unmount.
  `npx expo install expo-file-system` if not already present.
- [ ] Auto-speak when the setting is on **and** no screen reader is active;
  announce "Answer ready" before audio starts.
- [ ] Treat the model's clarification sentence as a normal answer; make "Ask
  Another Question" primary in that case.
- [ ] Loading screen: "Looking at your photo…", 8 s "Still working", 30 s
  timeout (504), Cancel.
- [ ] Error states: 503 model unavailable, 504 timeout, 429, offline, 500
  history-not-saved (still show the answer), TTS failure (answer stays, voice
  message shown).
- [ ] Show "Demo mode — not a real model" only in debug builds when
  `model_version` is `mock-0.0.0`.
- [ ] No confidence UI of any kind.

**Done when:** answer + audio work end to end against the mock backend; every
error above has a test; stopping/leaving the screen stops audio; VoiceOver and
TalkBack read the answer and reach "Listen Again" in one swipe.

---

## 6. Phase 4 — History, deletion, consent (C4)

- [ ] `src/app/consent.tsx`: one-time screen after first sign-in (design.md
  §7.12); sets `consentGiven`; cannot be skipped into the camera flow.
- [ ] `src/app/(tabs)/history.tsx`: load `GET /history`, rows via `HistoryRow`,
  explicit "Load More", empty/loading/offline/error states, visible Refresh.
- [ ] `src/app/history/[id].tsx`: full question/answer/photo/date/model version,
  playback controls, "Ask About This Photo Again" when `GET /images/{id}` works.
- [ ] Delete one entry with confirmation naming cascade behavior; delete all in
  Settings with confirmation naming history + photos; announce success.
- [ ] 404 image gone → hide retry affordances and show the backend sentence.
- [ ] Cache the last history page in memory only; do not add offline storage in
  this phase.

**Done when:** paging, delete-one, delete-all, and "image gone" are tested;
deleting never leaves a visible row after success; TalkBack/VoiceOver reads
each row as one sentence.

---

## 7. Phase 5 — Settings and About (C5, C7 partly)

- [ ] Rebuild `src/app/(tabs)/settings.tsx` in the order from design.md §7.11:
  Account → Reading & listening → Language → Privacy & data → About.
- [ ] Text size (system / large / extra large) with a live sample sentence.
- [ ] Speak answers automatically (default off when a screen reader is active).
- [ ] Speech speed (slow/normal/fast) wired to the player's rate.
- [ ] Spoken language picker (start with `en-IN`; only add codes the backend
  actually accepts) + note that answers are written in English.
- [ ] Privacy text + "Delete All History" + confirmation.
- [ ] About: app version, `model_version` from the last `/ask` (or a cached
  value), limitation paragraph, support link.
- [ ] Every toggle/picker announces its new value.

**Done when:** settings persist and change behaviour immediately; the About
screen reveals `mock-0.0.0` in development.

---

## 8. Phase 6 — Verification, tests, release (C5–C7)

### Tests

- [ ] Component tests per phase (capture, preview, ask, transcript, answer,
  history, settings, consent).
- [ ] One happy-path integration test with a mocked API:
  sign in → photo → voice → answer → replay → history.
- [ ] Error-path tests: permission denied, offline, 401 refresh, 413, 429, 503,
  504, TTS failure.
- [ ] Run `npm test -- --ci`, `npm run lint`, `npm run typecheck`,
  `npm run format:check`.

### Device accessibility pass (blocking)

- [ ] TalkBack (Android) and VoiceOver (iOS) full journey, plus screen curtain.
- [ ] 200% system text, largest app text scale, high contrast, reduced motion.
- [ ] Physical device with a Bluetooth speaker/headphones: TTS interruption and
  resume.
- [ ] One session with a blind or low-vision user; record notes.
- [ ] Fix findings before release; re-run the checklist in design.md §10.

### Release

- [ ] `app.json`: real name ("AskSight"), slug, scheme, icons, splash,
  permission strings, bundle identifiers.
- [ ] `EXPO_PUBLIC_API_URL` set per environment; no ngrok URL in release.
- [ ] Development build for device testing (`npx expo run:*` or Expo Build);
  Expo Go is not enough once camera/audio/secure-store are used.
- [ ] Signed Android and iOS builds; final acceptance on real devices.
- [ ] Document store submission and support contact.

---

## 9. Dependency order

```
Phase 0 (API · session · settings · a11y · components)
   ├─► Phase 1 (camera · library · upload)
   │      └─► Phase 2 (record · STT · transcript) ─► Phase 3 (answer · TTS)
   │                                                    └─► Phase 4 (history · consent)
   └─► Phase 5 (settings)  ──────────────────────────────────────────────┘
                                                                  Phase 6
```

If only one developer: do Phase 0 → 1 → 2 → 3 (demo-able) → 4 → 5 → 6.

---

## 10. Suggested PR split

| PR | Contents | Reviewable because |
|---|---|---|
| 1 | Phase 0 + Phase 1 | API/session/tests + capture; no answer flow yet |
| 2 | Phase 2 + Phase 3 | The core Q&A journey, mock backend, full error states |
| 3 | Phase 4 + Phase 5 | History, consent, settings; no new network shapes |
| 4 | Phase 6 | Test/accessibility/release evidence only |

Each PR must keep lint, typecheck, format, and the whole test suite green.

---

## 11. Risks and mitigations

| Risk | Effect | Mitigation |
|---|---|---|
| Model is the small 42%-accuracy checkpoint / mock | Wrong or `[mock answer]` output in a demo | Label demo builds; never present mock output as real; wait for the release checkpoint for user testing |
| No confidence score exists | Temptation to invent one | Design and tests forbid confidence UI; use the fixed "verify important information" note |
| `SARVAM_API_KEY` missing | STT/TTS return 503 | Typed questions and on-screen answers must always work; never make voice the only path |
| 30 s ask timeout / slow cold start | Dead-feeling wait | 8 s and 30 s spoken messages, Cancel, retry |
| Screen reader and TTS talk over each other | Unusable answer | Detect screen reader, default auto-speak off, announce before playing |
| TTS bytes have no URL | Player cannot stream them | Write to cache, play file, delete on unmount |
| Double-tap burns the 30/min limit | 429 in normal use | Disable while in flight, one request per action |
| Expo Go lacks native modules | Half the app cannot run | Use a development build from Phase 1 onward |
| Secure store unavailable/reset (Android backup) | Silent sign-out | Treat missing token as signed out; refresh once; clear message |
| Long text at 200% | Buttons pushed off-screen | Scrollable screens, no fixed heights around text, test at 200% |

---

## 12. Open decisions before Phase 1

- [ ] App display name, slug, scheme, and iOS/Android bundle identifiers.
- [ ] Production API URL and dev/staging URLs.
- [ ] Consent copy: exact wording for storage, Sarvam processing, and the
  "answers can be wrong" statement (needs sign-off).
- [ ] Default for auto-speak (design says on; screen readers override).
- [ ] Speech languages to expose once Sarvam's supported list is verified.
- [ ] Which TTS voice/speaker to request (backend accepts `voice`; provider
  default today).
- [ ] Whether "send automatically after speaking" ships in v1 or is deferred.
- [ ] Whether to compress large photos before upload (deferred until measured).

---

## 13. Definition of done (overall)

- The full journey works with the screen off/curtained on both platforms.
- Every state in design.md §9 has copy and a test.
- No screen depends on colour, gesture, timing, or precision.
- Text scales to 200% without losing an action.
- Answers are always available as text even when audio fails.
- `model_version` is visible in About; mock builds are labelled.
- Lint, typecheck, format, tests, and the device accessibility pass are green.

*This plan is derived from design.md and the implemented API/model; no app code
has been written against it yet. Risk: Phase 3's audio file handling and Phase
5's language list depend on decisions and provider limits that are still open.*
