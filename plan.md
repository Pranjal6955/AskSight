# AskSight UI — Implementation Plan

**Companion to:** [design.md](design.md) (the spec — read that first)
**Scope:** the Expo mobile app in `ui/`, from today's auth-only shell to the full
low-vision journey.
**Status:** Phase 0 foundations, Phase 1 capture/upload, Phase 2 ask flow, and
Phases 3, 4, and 5 are implemented. Phase 6 coding checks are implemented;
device accessibility verification and release work remain open for the owner.

The order below is deliberate: foundations first so every later screen is born
accessible, then capture → ask → answer (the demo path), then history and
settings, then device verification and release.

---

## 0. Where the app is today

| Built and working | Missing |
|---|---|
| Sign-in / sign-up, refresh-token restore, session expiry handling, consent-protected routes | Device verification |
| Home, camera, library picker, photo preview/upload, voice ask, answer playback, history and detail | — |
| API client, accessibility toolkit, persistent settings and history cache | Production release configuration |
| Design tokens, shared components, About metadata, and consent screen | Store builds and submission |
| 200 passing UI tests; lint, typecheck, and formatting clean | Device TalkBack/VoiceOver pass, screen-curtain verification, release builds |
| Core-journey integration test, phase tests, lint, typecheck, and formatting | TalkBack/VoiceOver, screen curtain, and physical-device checks |

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

- [x] Add types and functions: `TokenResponse` (access + refresh), `refresh`,
  `logout`, `uploadImage(file)`, `getImage(id)`, `ask(imageId, question)`,
  `transcribe(file)`, `synthesize(text, language, voice)`,
  `listHistory(cursor?)`, `getHistoryEntry(id)`, `deleteHistoryEntry(id)`,
  `deleteAllHistory()`, `deleteImage(id)`.
- [x] Keep the one `request` helper for JSON, plus separate helpers for
  multipart (`FormData` with `{ uri, name, type }`) and binary responses.
- [x] Attach `X-Request-ID` from the response to thrown errors for support.
- [x] Map the new statuses (413, 415, 429, 502, 503, 504) to the copy in
  design.md §9, while still preferring the backend sentence.

**Done when:** unit tests cover every function's URL, method, headers, and
error mapping; no new `any`. *(Verified.)*

### 2.2 Session persistence (`src/lib/session.ts`, `src/lib/auth.tsx`)

- [x] Install `expo-secure-store`; store only the **refresh token** there. Keep
  the access token in memory.
- [x] On cold start: read the refresh token → `POST /auth/refresh` → `GET /auth/me`.
  Persist the rotated refresh token, discard the old one.
- [x] On any 401: refresh once, retry the request once, then sign out with the
  "Your session has expired" message.
- [x] Sign out: call `POST /auth/logout`, delete the stored token even if the
  call fails, clear state.
- [x] Guard routes with `Stack.Protected` (SDK 57). `redirectTo` is SDK 58+ —
  use the anchor route; keep `app/index.tsx` redirecting to `/login` when
  signed out.
- [x] Add an `authReady` loading state so the app does not flash the login
  screen while restoring.

**Done when:** a killed-and-reopened app lands on Home when the refresh token is
valid; an expired/revoked token lands on Login; tests cover refresh-once,
rotate, and sign-out. *(Verified.)*

### 2.3 Settings store (`src/lib/settings.tsx`)

- [x] Context + persistence for: `speakAutomatically` (default on),
  `speechRate` (`0.8 | 1 | 1.2`), `textScale` (`system | large | xlarge`),
  `speechLanguage` (default `en-IN`), `consentGiven`.
- [x] Persist as JSON in `expo-secure-store` (already installed for tokens; the
  payload is tiny) so no second storage dependency is added.
- [x] Provide a `useSettings()` hook and a text-scale helper that multiplies the
app's type sizes without overriding the OS scale. The Settings screen has a
live sample and announces text-size changes.

**Done when:** values survive restart; changing text scale updates a preview
immediately and is announced. *(Verified.)*

### 2.4 Accessibility toolkit (`src/lib/a11y.ts`, `src/lib/useA11y.ts`)

- [x] `announce(message, assertive?)` wrapper around
  `AccessibilityInfo.announceForAccessibility`.
- [x] `useScreenReader()` from `AccessibilityInfo.isScreenReaderEnabled()` with
  a subscription, used to default auto-speak off.
- [x] `useReduceMotion()` and `useHighContrast()` (platform-supported only).
- [x] A small `describeDate(iso)` helper for spoken dates ("Today at 2:15 PM").
- [x] Focus helpers: a ref-based `setAccessibilityFocus` for moving focus to the
  answer/primary action after a transition.

### 2.5 Shared components (`src/components/`)

- [x] `ScreenHeader` — title as header, labelled back button.
- [x] `ActionCard` — the Home "Take a Photo" pattern as a reusable one-button card.
- [x] `StatusBanner` — info/success/warning/error, icon + text, no auto-dismiss;
  `accessibilityRole="alert"` for errors.
- [x] `MicButton` — idle/listening/processing, 120–140 dp, tap-to-toggle,
  `accessibilityState.selected`, label swaps.
- [x] `AnswerBlock` — answer text at answer size, playback row, verify note.
- [x] `HistoryRow` — combined label, 96 dp, question + 2-line answer + date.
- [x] `ConfirmDialog` — names the consequence; destructive action not default.
- [x] `ProgressAnnouncer` — announce start, 8 s "still working", finish.

**Done when:** each component has a test for its accessible label/state and a
Story-style render in the existing test setup (no Storybook dependency).
*(Verified.)*

### 2.6 Test harness

- [x] Shared test helpers for a signed-in `AuthProvider`, a fake API, and
  accessibility queries (`getByRole`, `getByLabelText`).
- [x] Confirm all 200 UI tests pass; lint and typecheck are clean.

---

## 3. Phase 1 — Capture and upload (C1)

- [x] `npx expo install expo-camera expo-image-picker expo-haptics` (SDK 57
  compatible versions).
- [x] Add camera and photo-library permission copy to `app.json` config plugins
  (permission strings explain *why*, in plain language).
- [x] `src/app/capture.tsx` (modal): full preview, bottom control bar, torch,
  whole-preview tap to capture, Close.
  - `CameraView` + `useCameraPermissions`; `takePictureAsync` with quality
    ~0.8 and a sane size.
  - Spoken guidance on entry only; announce torch and shutter.
- [x] `src/app/photo-preview.tsx`: image, "Use Photo", "Retake", "Choose
  Another", upload progress on the primary button, spoken milestones after 3 s.
- [x] Library path: `ImagePicker.requestMediaLibraryPermissionsAsync` then
  `launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8 })`.
- [x] Wire Home's primary card and "Choose from Library" to the flows.
- [x] Upload via `POST /images`; keep the returned `image_id` in navigation
  params. Backend error details and offline errors reach the preview banner.
- [x] Preserve the selected photo across a 401 re-authentication flow where
  possible (kept in memory only and restored after sign-in).
- [x] Denied camera permission: pre-permission explanation, then OS prompt; on denial
  show how to enable it and offer the library path.
- [x] Guard double submission (disable while uploading; rate limit is 30/min).
- [x] Add Phase 1 component tests for permission denial, upload failure, retry,
  and oversized photos.
- [ ] Verify camera and screen-reader flows on real iOS and Android devices,
  including screen curtain.

The Phase 2 Ask screen receives the uploaded `image_id` and selected photo URI.
Upload uses the existing fetch-based API helper, so it announces that upload is
taking longer after 3 s but cannot report percentage progress yet.

Automated coverage passes for camera permission denial, library selection,
upload failure/retry, oversized uploads, and resuming the selected photo after
sign-in. TalkBack/VoiceOver and screen-curtain verification still needs physical
devices.

**Done when:** a user can take a photo or pick one, see it, retry, and reach the
Ask screen with an `image_id`; TalkBack/VoiceOver can complete it with the
screen curtain on; tests cover permission denial, upload failure, retry, and
oversize.

Do **not** add client-side image resizing yet. Uploads are capped at 10 MB and
phone JPEGs are usually under it. Add compression only if real uploads are slow
or oversized.

---

## 4. Phase 2 — Ask by voice (C2)

### Intended flow

The selected/uploaded photo enters Ask with its `image_id` and a local photo
thumbnail URI. The user can record a question or type one. Recording permission
is explained before the OS prompt; if permission is denied, Settings and typed
entry remain available. Stopping a recording sends it to `/stt`, then the user
reviews and edits the transcript before confirming. Typed questions skip STT.
Both paths submit `{ image_id, question }` to `/ask`, keep backend error detail
visible for retry, and hand the returned answer payload to the Answer screen.
Recording stops automatically after 60 seconds. Background recording and
playback are disabled.

- [x] `npx expo install expo-audio` (SDK 57-compatible version).
- [x] `src/lib/useRecorder.ts`: permission check
  (`AudioModule.requestRecordingPermissionsAsync`), `useAudioRecorder` with
  `RecordingPresets.HIGH_QUALITY` (m4a is accepted by the backend), stop and
  return the file URI, 60 s auto-stop, cleanup on unmount.
- [x] `src/lib/useSpeech.ts`: `useAudioPlayer` for TTS playback, `play(uri)`,
  `stop()`, `isPlaying`, audio-mode setup so it ducks/pauses other audio.
- [x] `src/app/ask.tsx`: photo thumbnail, giant `MicButton` (tap to start/stop),
  timer, "Cancel recording", typed fallback field with 1–500 char limit and
  visible label, example chips that fill (not submit), "Ask" primary.
- [x] Voice path: stop → `POST /stt` (multipart) → transcript screen.
- [x] `src/app/transcript.tsx`: "Did we hear you right?", transcript text,
  "Ask This Question" primary, "Speak Again", "Edit". Announce the transcript,
  focus the primary action.
- [x] Submit `POST /ask` with `{ image_id, question }`; navigate to Answer with
  the entry id and the answer payload.
- [x] Errors: STT 503 (no key) → "Voice isn't available right now. You can type
  your question."; empty audio, unsupported format, 429; offline.
- [ ] Auto-send preference remains off/absent; it is deferred with the settings
  work in Phase 5. Phase 2 always asks the user to review the transcript first.

**Done:** recorded questions become editable text, can be confirmed and sent;
typed questions work if voice is unavailable; tests cover record → transcribe →
confirm, transcription failure with typed fallback, and Ask failure with retry.
Automated checks: 200 UI tests pass; lint and typecheck pass. Physical
TalkBack/VoiceOver verification remains part of Phase 6.

---

## 5. Phase 3 — Answer and playback (C3)

### Intended flow

After `/ask` succeeds, show the returned answer immediately and announce it.
If auto-speech is enabled and VoiceOver/TalkBack is not active, fetch TTS audio,
write the returned bytes to a temporary cache file, then play it. The answer
remains readable if TTS is slow or unavailable. The user can replay or stop the
audio; leaving the screen stops playback and removes the temporary file. While
`/ask` is pending, show interruptible progress and allow Cancel to stop waiting
and return to question entry. The server's 30-second response remains the
source of its timeout error. If history persistence fails after inference, the
backend must include the generated answer in its error payload so the app can
show it while preserving the backend's error sentence.

- [x] `src/app/answer.tsx`: question recap, answer at 30–34 px, playback row
  ("Listen Again" / "Stop"), "Ask Another Question" / "New Photo", verify note,
  optional photo thumbnail.
- [x] `POST /tts` with the answer text and chosen language; write the returned
  `audio/mpeg` bytes to `Paths.cache` with `expo-file-system`
  (`new File(Paths.cache, ...)`), play the file URI, delete it on unmount.
  Declare the existing SDK-compatible `expo-file-system` package as a direct
  dependency. For web, use a temporary object URL and revoke it on cleanup.
- [x] Auto-speak when the setting is on **and** no screen reader is active;
  announce "Answer ready" before audio starts.
- [x] Treat the model's clarification sentence as a normal answer; make "Ask
  Another Question" primary in that case.
- [x] Loading state: "Looking at your photo…", 8 s "Still working", server's 30 s
  timeout (504), Cancel.
- [x] Error states: 503 model unavailable, 504 timeout, 429, offline, 500
  history-not-saved (still show the answer), TTS failure (answer stays, voice
  message shown).
- [x] Show "Demo mode — not a real model" only in debug builds when
  `model_version` is `mock-0.0.0`.
- [x] No confidence UI of any kind.

**Done:** answer + audio use `/tts`; automatic playback respects the stored
setting and screen-reader state; stopping/leaving the screen stops audio and
removes its temporary file; clarification and history-save errors retain the
answer. UI checks: 187 tests pass, lint and typecheck pass. Backend persistence
failure response is covered by a new test (run status pending).

**Research note:** `/ask` has a 30-second server timeout and `/tts` returns raw
`audio/mpeg`; `TTSRequest.text` accepts 1–2,000 characters. The history-save
500 response now retains `detail` and includes the generated `answer` and
`model_version`, so the UI can preserve a valid answer when only persistence
fails. Expo SDK 57 FileSystem is used for native cache writes; web uses a
temporary object URL that is revoked when the answer screen leaves. Physical
VoiceOver/TalkBack review remains part of Phase 6.

---

## 6. Phase 4 — History, deletion, consent (C4)

### Intended flow

After sign-in, users without `consentGiven` are routed to a consent screen and
cannot open Home, capture, library, or Ask until they accept. Consent explains
stored photos/questions/answers, unsaved generated speech, and audio/answer text
sent to the speech provider; Read More expands the details. History loads the
first cursor page, caches it in memory for offline return, and lets the user
refresh or explicitly load more. A row opens a full detail view; available
photos can be used to ask again. Delete-one confirms that the photo is removed
when it was the last question about it; delete-all confirms that questions,
answers, and photos are removed. Both deletions update the in-memory cache only
after the server succeeds.

- [x] `src/app/consent.tsx`: one-time screen after first sign-in (design.md
  §7.12); sets `consentGiven`; cannot be skipped into the camera flow.
- [x] `src/app/(tabs)/history.tsx`: load `GET /history`, rows via `HistoryRow`,
  explicit "Load More", empty/loading/offline/error states, visible Refresh.
- [x] `src/app/history/[id].tsx`: full question/answer/photo/date/model version,
  playback controls, "Ask About This Photo Again" when `GET /images/{id}` works.
- [x] Delete one entry with confirmation naming cascade behavior; delete all in
  Settings with confirmation naming history + photos; announce success.
- [x] 404 image gone → hide retry affordances and show the backend sentence.
- [x] Cache the last history page in memory only; do not add offline storage in
  this phase.

**Done:** paging, delete-one, delete-all, and "image gone" are tested;
deleting never leaves a visible row after success; TalkBack/VoiceOver reads
each row as one sentence. UI checks: 192 tests pass; lint and typecheck pass.
Physical screen-reader verification remains in Phase 6.

**Research note:** `/history` defaults to 20 items, accepts a cursor and has
`has_more`; `GET /history/{id}` returns the full exchange. Deleting the last
entry for an image cascades to that photo; `DELETE /history` removes all owned
history and photo bytes. All these routes are authenticated and return plain
English `detail` errors. Expo Router SDK 57 `Stack.Protected` redirects denied
routes through the app's anchor (`index`); the anchor must choose `/consent`
when signed in without consent, otherwise it chooses Home.

---

## 7. Phase 5 — Settings and About (C5, C7 partly)

- [x] Rebuild `src/app/(tabs)/settings.tsx` in the order from design.md §7.11:
  Account → Reading & listening → Language → Privacy & data → About.
- [x] Text size (system / large / extra large) with a live sample sentence.
- [x] Speak answers automatically (default off when a screen reader is active).
- [x] Speech speed (slow/normal/fast) wired to the player's rate.
- [x] Spoken language picker (start with `en-IN`; only add codes the backend
  actually accepts) + note that answers are written in English.
- [x] Privacy text + "Delete All History" + confirmation.
- [x] About: app version, `model_version` from the last `/ask` (or a cached
  value), limitation paragraph, support link.
- [x] Every toggle/picker announces its new value.

**Done:** settings persist and change behaviour immediately; the About screen
shows the last model version and labels `mock-0.0.0` in development. The
support action opens the repository's issue page. UI tests cover persistence,
announcements, sign-out confirmation, deletion errors, and About metadata.

---

## 8. Phase 6 — Verification, tests, release (C5–C7)

### Tests

- [x] Component tests per phase (capture, preview, ask, transcript, answer,
  history, settings, consent).
- [x] One happy-path integration test with a mocked API:
  sign in → photo → voice → answer → replay → history.
- [x] Error-path tests: permission denied, offline, 401 refresh, 413, 429, 503,
  504, TTS failure.
- [x] Run `npm test -- --ci`, `npm run lint`, `npm run typecheck`,
  `npm run format:check`.

### Device accessibility pass (blocking)

- [ ] TalkBack (Android) and VoiceOver (iOS) full journey, plus screen curtain.
- [ ] 200% system text, largest app text scale, high contrast, reduced motion.
- [ ] Physical device with a Bluetooth speaker/headphones: TTS interruption and
  resume.
- [ ] One session with a blind or low-vision user; record notes.
- [ ] Fix findings before release; re-run the checklist in design.md §10.

### Release

Release work is intentionally left for the project owner. No release builds,
signing, submission, or deployment were performed in this phase.

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
