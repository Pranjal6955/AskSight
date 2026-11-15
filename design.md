# AskSight — Mobile UI Design

**Status:** design specification, not yet implemented.
**Audience of the product:** blind and low-vision people. Every choice below is
made for someone who may not see the screen at all, may see only very large
shapes, or may see the screen with magnification and high contrast.
**Implementation plan:** [plan.md](plan.md)
**Companion docs:** [API contract](docs/api-contracts.md) ·
[deployment](docs/deployment.md) · [backend remaining work](backend/REMAINING_WORK.md) ·
[model README](model/README.md) · [task list](docs/Task.md)

---

## 1. The one-sentence design rule

**The app is an ears-first assistant with a screen attached, not a screen app
with audio bolted on.**

A sighted user never needs to look at AskSight for the core journey: take a
photo, ask a question, hear the answer. The screen exists to make the same
journey usable for people with partial vision, for sighted helpers, and for
someone who is deaf-blind and reading with a braille display.

---

## 2. What the backend and model can actually do

The design must promise only what the system behind it supports today.

### 2.1 API surface (implemented)

| Capability | Endpoint | Rules the UI must respect |
|---|---|---|
| Sign up / sign in | `POST /auth/signup`, `/auth/login` | Access token lives 30 min; refresh token 30 days, rotated on every refresh |
| Stay signed in | `POST /auth/refresh`, `/auth/logout` | Refresh token belongs in secure storage, never in plain async storage |
| Upload a photo | `POST /images` | JPEG/PNG, ≤ 10 MB; returns id + dimensions |
| Show a photo | `GET /images/{id}` | Requires the bearer token; use it for previews |
| Ask a question | `POST /ask` | 1–500 characters, non-blank; 30 s server timeout |
| Voice question | `POST /stt` | Audio ≤ 15 MB; WAV, MP3, OGG, FLAC, M4A/MP4, AIFF, AMR, WebM |
| Spoken answer | `POST /tts` | Text 1–2000 chars; returns `audio/mpeg` bytes |
| History | `GET /history`, `GET /history/{id}` | Cursor pagination, newest first, 1–50 per page |
| Delete | `DELETE /history/{id}`, `DELETE /history`, `DELETE /images/{id}` | Deletion is permanent; images are deleted with their last entry |
| Health | `GET /health/live`, `/health/ready`, `/health/model` | Not used by the app UI, useful for support |

Every error body is `{ "detail": "<full plain-English sentence>" }`. **The app
shows that sentence verbatim**; it never composes its own technical wording.
Rate limits (30/min per user for upload/ask/speech) mean the UI must disable a
button while a request is in flight so a double-tap cannot burn a quota.

### 2.2 Model behaviour (implemented, checkpoint still being trained)

- Answers are **English, one word or a short phrase**, which is also what the
  spoken output is tuned for.
- The model is a VQA system: it answers *questions about a photo*, it does not
  freely describe a scene and does not read long documents word-for-word.
- There is **no confidence score**. Do not design a percentage, stars, or a
  green/red "sure" badge — no calibrated number exists.
- When the model produces nothing usable it returns a clarification sentence
  ("Sorry, I could not find a clear answer. Could you ask again in different
  words?"). That is a **normal answer**, not an error state.
- Blurry, dark, obstructed, or very low-resolution photos can produce wrong
  answers. Show a gentle "answers can be wrong — please verify important
  information" note; never dress a guess up as certainty.
- Current development checkpoint is trained on a small subset and scores about
  **42% VQA accuracy** on its held-out split (263 questions). Latency measured
  on a T4 was ~0.22 s median. Neither number is a user-facing promise.
- Without `ASKSIGHT_MODEL_CHECKPOINT` the backend serves a mock whose answers
  start with `[mock answer]`. The UI must show the returned `model_version`
  somewhere in Settings → About so a tester can tell mock from real.
- Answers are English even when the question is spoken in another language:
  Sarvam can transcribe and speak Indian languages, but the VQA model is
  English-only. Say so in the language setting.

### 2.3 What follows for the design

1. Voice is the primary input and primary output; text is the fallback.
2. Never invent certainty the model cannot provide.
3. Never make a timed interaction the only path (no 3-second toast, no
   auto-advancing carousel).
4. Never make a gesture the only path to an action.
5. Expect poor connectivity and slow model cold starts; design the waiting
   states, not just the happy path.
6. Single-turn Q&A only. "Ask another question about the same photo" is
   supported by the API; multi-turn conversational context is not.

---

## 3. Who we are designing for

| User | What they need | Design consequence |
|---|---|---|
| Totally blind, uses VoiceOver/TalkBack | Everything reachable and understandable by ear | Every element labelled; spoken state changes; no unlabelled icons |
| Low vision, large text / magnification | Big type, strong contrast, simple layout, no clutter | 20 px minimum body text, 4.5:1 contrast, one primary action per screen |
| Low vision with light sensitivity | Control over brightness, dark-on-light default, no flashing | No strobe/animation; respect reduce-motion; follow system theme |
| Deaf-blind with braille display | Text that is complete and ordered | Full sentences in labels, no information that only exists as audio |
| Older user with tremor | Big targets, forgiving taps | 48 dp minimum, 64 dp primary, ≥ 8 dp gaps, no precise gestures |
| Sighted helper | Quick to understand and explain | Plain language, visible labels, obvious primary button |

---

## 4. Accessibility principles (non-negotiable)

1. **Ears first.** Every state change has a spoken component, either the answer
   itself or an `AccessibilityInfo.announceForAccessibility` message.
2. **One primary action per screen.** A single large button; everything else is
   clearly secondary.
3. **Never colour alone.** Status = icon + text + shape. Error is not just red.
4. **No time limits.** Nothing expires, auto-dismisses, or auto-submits. A user
   may take a minute to answer.
5. **No gesture-only actions.** Swipe-to-delete, long-press, and drag are
   shortcuts, never the only way.
6. **No precision aiming.** The whole photo preview is a capture target; the mic
   is a toggle, not a hold.
7. **Text is real text.** Respect OS font scaling up to 200%; no fixed-height
   text boxes; no text baked into images.
8. **Say what happened, then what to do.** "We couldn't connect. Check your
   internet and try again." Not "Network error."
9. **The screen reader order is the visual order.** Top to bottom, left to
   right; decorative shapes are hidden from accessibility.
10. **Nothing moves unless the user moved it.** No autoplay video, no pulsing
    decorations; a progress indicator may animate only if reduce-motion is off.

---

## 5. Visual system

These tokens already exist in `ui/tailwind.config.js` and are the baseline.

### 5.1 Colour

| Token | Value | Use | Contrast on canvas |
|---|---|---|---|
| `canvas` | `#FAF7F0` | App background | — |
| `ink` | `#000000` | Headings, body text, primary button | ~19:1 (AAA) |
| `muted` | `#404040` | Supporting text | ~10:1 (AAA) |
| `inputBorder` | `#737373` | Field and card borders | ≥ 3:1 non-text |
| `error` | `#B42318` | Error text/border | ≥ 4.5:1 on white and canvas |
| `success` | `#166534` | Success text/border | ≥ 4.5:1 on white |
| `warning` | `#FACC15` | "Working" button background **with black text only** | 21:1 black-on-yellow |
| `field` / `card.*` | `#F2F2F2` | Neutral surfaces | text is always `ink`/`muted` |

Rules:

- Body text never lighter than `#404040` on `canvas` or white.
- Disabled state changes the **surface**, not the text opacity. Dimmed text that
  drops below 4.5:1 is a bug.
- High-contrast users get pure black borders (the existing
  `prefers-contrast: high` CSS does this on web; mirror it with
  `AccessibilityInfo.isHighTextContrastEnabled` in the app).
- Never use `warning` yellow behind white text.

### 5.2 Type scale

| Role | Size / line height | Weight |
|---|---|---|
| Hero greeting | 44–48 / 52 | Bold |
| Screen title | 34–36 / 40 | Bold |
| Section heading | 24–26 / 32 | Bold |
| Answer text (the most important text in the app) | 30–34 / 40 | Semibold |
| Body large | 22 / 30 | Regular |
| Body | 20 / 28 | Regular |
| Supporting | 18 / 26 | Regular |
| Caption / metadata | 16 / 24 | Regular |

Nothing below 16 px. The answer is never smaller than the question. Long
answers wrap; no truncation of an answer anywhere it is the point of the screen
(list previews may clamp to 2 lines, detail shows all).

### 5.3 Spacing, shape, targets

- Spacing steps: 4, 8, 12, 16, 20, 24, 32, 40.
- Screen padding: 24 horizontal, 24–32 vertical.
- Card radius 20; hero card 28–30; fields 12; pills fully rounded.
- Card border 2 px where the card is a control; 1 px is decorative only.
- Minimum target 48 × 48 dp (iOS 44 pt), primary actions 64 high, mic 120–140.
- Minimum 8 dp between adjacent targets.

### 5.4 Motion

- 150–250 ms fades/slides only.
- Honour `prefers-reduced-motion` / `AccessibilityInfo.isReduceMotionEnabled`:
  replace movement with an instant state change plus a spoken announcement.
- A spinner may spin; nothing else loops.

---

## 6. Navigation map

```
Signed out ──► /login ──► /signup
                   │
                   ▼
        Tabs: Home · History · Settings
                   │
Home ──► Camera (modal) ──► Photo preview ──► Ask ──► Thinking ──► Answer
  │                                │                                 │
  │                                └── Retake ◄──────────────────────┘
  │                                                                  │
  └── Photo library picker ──────────────────────────────────────────┘
                                                                     │
History ──► Entry detail ──► (delete)                                │
Settings ──► Text size · Spoken answers · Language · Privacy · About ┘
```

Back always cancels the current step without deleting the photo until the user
leaves the answer screen or explicitly starts over.

---

## 7. Screens

Each screen lists the visual layout, the spoken experience, and its states.
Copy in quotes is the recommended wording; backend `detail` strings always win
when they exist.

### 7.1 Sign in / Sign up (already built — keep the pattern)

- Brand mark, screen title, visible field labels (never placeholder-only),
  large fields, show/hide password button, one primary button.
- Errors appear in a bordered banner with an icon, `role="alert"`, and are
  announced; the message is the backend sentence.
- Success announces "You're signed in. Opening AskSight."
- Sign-up explains password rules in text before submission, not only after an
  error.
- **Change from today:** persist the refresh token in secure storage and restore
  the session on cold start; a returning user should not land on `/login`.

### 7.2 Home

**Purpose:** one obvious way to start; recent activity for orientation.

- Top: "AskSight" wordmark + Settings button (labelled "Open settings").
- Greeting: "Hello, {first name}!" — hero size.
- One sentence: "Take a photo and let AskSight describe what you see."
- **Primary card:** "Take a Photo" — the entire card is one 48 dp+ button, not a
  card with a small link. Accessible label: "Take a photo. Opens the camera."
  Hint: "You can also choose a photo from your library."
- Secondary action, equal visual weight but smaller: "Choose from Library".
- "Recent activity": the last 1–2 entries, or the empty state with the CTA
  "Ask your first question".
- Screen-reader order: greeting → instruction → Take a Photo → Library →
  Recent activity → tab bar.

States: signed out (redirect), loading recent (skeleton with a label, announce
"Loading recent questions"), empty, error (banner + Retry, recent list keeps
whatever was already shown).

### 7.3 Camera

**Purpose:** capture a usable photo without needing to see the viewfinder.

- Full-bleed preview. Controls in a solid bottom bar (never over a busy image
  without a scrim).
- Controls, left to right: Close ("Close camera"), **Take Photo** (large round,
  96–120 dp), Torch ("Turn flashlight on/off"), and a "Choose from Library"
  text button.
- **The whole preview is tappable to capture.** A blind user cannot aim at a
  small shutter. The visible button stays for discoverability.
- Spoken guidance on entry (once, not on every focus): "Camera ready. Point
  away from you, about an arm's length from what you want to see. Tap anywhere
  to take a photo."
- Torch state is announced: "Flashlight on."
- Permission flow: a pre-permission screen in plain language ("AskSight needs
  the camera to see what you want to ask about") with Continue/Not now; only
  then the OS prompt. If denied, explain how to enable it in Settings and offer
  "Choose from Library" instead.
- Never require the user to frame or focus. Auto-focus and auto-exposure stay on.
- After capture: shutter feedback (optional haptic) + announce "Photo taken."

### 7.4 Photo preview

**Purpose:** confirm the photo is worth asking about, without forcing a visual
judgement.

- Large preview image (decorative for screen readers — the user just took it;
  the accessible description is "Your photo").
- Title: "Use this photo?"
- Primary: "Use Photo".
- Secondary: "Retake" and "Choose Another".
- Optional helpful prompt: "If the photo is blurry or dark, retake it for a
  better answer." Do not claim to detect quality — no such score exists.
- If upload is slow, keep the preview and show progress on the primary button
  ("Uploading photo… 60%") with a spoken progress announcement at 25/50/75/100%
  only if it takes longer than 3 seconds.

States: uploading, upload failed (banner + "Try Again" + "Choose Another"),
oversized/unsupported (the backend sentence, plus "Choose Another"), 401
(session expired → sign-in prompt preserving the photo where possible).

### 7.5 Ask (question screen)

**Purpose:** capture the question with the least possible effort.

- Photo thumbnail (small, decorative) + "Ask about this photo".
- **Giant microphone button** in the centre: 120–140 dp, label under it:
  "Tap to speak" → "Tap to stop".
- **Tap to start, tap to stop** — not press-and-hold (tremor, one-handed use,
  screen-reader activation all make hold unreliable).
- While recording: a visible timer plus a spoken "Listening" announcement; the
  button changes shape/icon (stop square) and the label changes; no other
  controls compete with it.
- Cancel recording button: "Cancel recording".
- Text fallback directly below, always visible: a labelled field "Or type your
  question" with a real visible label, 500-character limit counter only near the
  limit, and an "Ask" button.
- Example chips (optional, large text): "What does this say?", "What colour is
  this?", "Is this safe to eat?" — tapping fills the field, it does not submit.
- Auto-stop at 60 seconds with an announcement: "Recording stopped. Tap Ask to
  send your question."

States: idle, recording, transcribing ("Turning your question into text…"),
transcript ready, transcription failed (banner + "Speak Again" + "Type Instead"),
microphone permission denied (explain + text fallback), offline (text entry still
works, submission explained), rate limited (backend sentence, button disabled
briefly).

### 7.6 Transcript review

**Purpose:** avoid sending a misheard question.

- Title: "Did we hear you right?"
- The transcript in body-large text, selectable.
- Primary: "Ask This Question".
- Secondary: "Speak Again" and "Edit".
- Editing turns the transcript into a normal text field with the keyboard.
- Announce the transcript when it arrives; move accessibility focus to the
  primary button, not the text, so one swipe reaches the action.
- Setting (off by default): "Send questions automatically after I stop
  speaking" — for users who find confirmation slow.

### 7.7 Thinking

**Purpose:** make waiting understandable and interruptible.

- Big status line: "Looking at your photo…" (this is the only place a small
  progress indicator may animate).
- Announced once on entry.
- After 8 seconds: "Still working. This can take up to 30 seconds."
- At 30 seconds the server returns 504; show the backend sentence and offer
  "Try Again" and "Ask a Different Question".
- Provide "Cancel" that returns to Ask without claiming the answer failed — the
  request may still complete server-side, but the UI stops waiting.
- Never block the back gesture.

### 7.8 Answer (the most important screen)

**Purpose:** deliver one answer that is easy to hear and easy to read.

Layout, top to bottom:

1. "Your answer" as a section heading, with the question repeated above in
   supporting text ("You asked: What does this sign say?").
2. **Answer text** at 30–34 px, semibold, full width, no truncation.
3. Playback row directly under the answer:
   - **"Listen Again"** (primary, large),
   - **"Stop"** while speaking (same position, label swaps, announced),
   - a visible speaker-state line ("Speaking…" / "Stopped").
4. Actions: **"Ask Another Question"** (primary if the answer was a
   clarification; otherwise secondary) and "New Photo".
5. A quiet, permanent note: "Answers can be wrong, especially in low light or
   when the photo is blurry. Please verify important information." Screen
   readers read it as part of the screen; it is not an alert.
6. Thumbnail of the photo with an accessible label "Photo you asked about"; it
   can be tapped to view full-screen but that is optional.

Spoken behaviour:

- If "Speak answers automatically" is on (default **on**), the answer starts
  speaking as soon as it arrives. Announce "Answer ready" immediately before, so
  a screen-reader user knows why audio started.
- Speech must not fight the screen reader. If VoiceOver/TalkBack is active,
  prefer the screen reader's own reading by default and offer "Listen Again" —
  detect screen-reader state and default the setting accordingly. Never play TTS
  over an active screen-reader utterance without user action.
- Playback respects the media volume, pauses other app audio where the OS
  allows it, and stops when the screen is left.
- If TTS fails (503/502/timeout), the answer is still shown and announced:
  "The answer is on screen, but the voice is unavailable right now. You can
  read it or try Listen Again." Never lose the answer because audio failed.
- If the answer is the model's clarification sentence, treat it as a valid
  answer: speak it, and make "Ask Another Question" the primary action.
- Show no confidence indicator of any kind.
- If `model_version` is `mock-0.0.0`, show a development ribbon "Demo mode —
  not a real model" (debug builds only).

States: answering (see 7.7), answer ready, answer ready + TTS playing, TTS
unavailable, 503 model unavailable ("The model is unavailable right now. Please
try again later."), 429, 500 history-not-saved (show the answer, say "This
answer couldn't be saved to your history" — the answer itself is still valid).

### 7.9 History

**Purpose:** find and revisit a past answer by ear.

- Title "History", one sentence of context.
- List rows (minimum 96 dp tall, 2 px separation):
  - question (bold, clamped to 2 lines),
  - answer preview (2 lines),
  - relative date ("Today, 2:15 PM", "12 November").
  - Accessible label: "Question: {question}. Answer: {answer}. Asked {date}."
  - Tap opens the detail screen.
- Pagination: an explicit **"Load More"** button at the end (not infinite
  scroll only), announced as "Loading more…" then "More questions loaded".
- Empty state: icon + "No questions yet" + "Your past questions will appear
  here." + "Ask your first question".
- Offline: show cached rows if available, with a banner "You're offline. Showing
  saved questions."; otherwise the backend/friendly error + Retry.
- Delete: in the detail screen only, as a clearly labelled button
  ("Delete this question and its answer"), with a confirmation dialog that
  states what else disappears (the photo, if this was its last question).
  Swipe-to-delete is not the only path.
- Pull-to-refresh is a shortcut; provide a visible "Refresh" action too.

### 7.10 History detail

- Full question, full answer at answer size, photo (if it still exists),
  date, and model version in small text (transparency without clutter).
- Playback controls identical to 7.8 ("Listen Again" / "Stop").
- "Ask About This Photo Again" if the image still exists (checks
  `GET /images/{id}`); if it returns 404, hide the action and show the backend
  sentence only if the user tries to use the image.
- "Delete" as described above; on success announce "Question deleted." and
  return to History.

### 7.11 Settings

Order by usefulness to the audience, not by implementation:

1. **Account** — name, email (read-only, announced as one sentence), Sign out
   (destructive style, confirmation).
2. **Reading & listening**
   - "Speak answers automatically" (default on, off if a screen reader is
     active),
   - "Speech speed" (Slow / Normal / Fast) — 0.8× / 1.0× / 1.2×,
   - "Text size" — "Follow system" / "Large" / "Extra large" (applies an app
     font scale on top of the OS setting; preview line updates and is
     announced).
3. **Language**
   - "Spoken language" for STT/TTS (start with English (India); list the
     languages Sarvam supports once verified),
   - a note: "Answers are currently written in English."
4. **Privacy & data**
   - "Photos and questions are stored until you delete them. Speech is not
     stored."
   - "Delete All History" (destructive, confirmation that names both history
     and photos),
   - a short line on what Sarvam processes (audio, text) once provider details
     are final.
5. **About AskSight**
   - version, `model_version` (so testers can spot `mock-0.0.0`),
   - the limitation note: answers can be wrong, VQA scope, English answers,
   - link to help/support.

Every toggle and picker is a standard accessible control with a visible label;
changes are announced ("Speak answers automatically, on").

### 7.12 First-run consent / privacy

Shown once after the first sign-in, before any photo is uploaded:

- Title: "Before you start"
- Three short bullets: what is stored (photo, question, answer until deleted),
  what is not stored (generated speech), and what is sent to Sarvam (recorded
  audio and answer text for voice).
- "Answers can be wrong. Please verify important information."
- Primary "I Understand" (44 dp+), secondary "Read More".
- Screen readers read the bullets as a list; focus starts at the title.

Do not make consent a checkbox hidden in Settings. It is a screen, once, in
plain language.

---

## 8. Components to build

| Component | Responsibility | Accessibility notes |
|---|---|---|
| `ActionCard` | Hero action (Take a Photo) | One button role; label + hint; whole card tap |
| `PrimaryButton` | Existing; reuse | Busy state announced; disabled surface, not dim text |
| `SecondaryButton` | Outlined actions | Same target sizes as primary |
| `MicButton` | Idle / listening / processing | `accessibilityState.selected` while recording; label swaps; min 120 dp |
| `StatusBanner` | info / success / warning / error | Icon + text; `alert` for errors, polite for success; never auto-dismiss |
| `AnswerBlock` | Answer + playback + verify note | Answer is one text node; playback controls follow it |
| `HistoryRow` | List item | Single combined accessible label; 96 dp tall |
| `ScreenHeader` | Title + back | Back labelled "Go back"; title is a header |
| `ProgressAnnouncer` | Long-running request | Announce start, 8 s still-working, completion/failure |
| `ConfirmDialog` | Destructive actions | Names the consequence; destructive action is not the default focus |

Keep the existing `AuthField` and `PrimaryButton` patterns: visible labels,
2 px borders, 48 dp inputs, `aria-invalid`/`aria-describedby` equivalents, live
regions.

---

## 9. Copy rules

- One sentence per message. Say what happened and what to do next.
- Use the backend `detail` sentence verbatim for API errors; the backend owns
  wording so it can stay consistent across platforms.
- Never show status codes, field names, URLs, stack traces, or "Error: ".
- Buttons are verbs: "Take Photo", "Ask This Question", "Listen Again",
  "Delete", not "OK"/"Submit".
- Sentence case, no capitals for emphasis, no exclamation marks in errors.
- Numbers and dates are spoken as words by the screen reader automatically; keep
  them in the text.

Suggested state copy:

| Situation | Copy |
|---|---|
| Listening | "Listening. Tap stop when you're done." |
| Transcribing | "Turning your question into text." |
| Thinking | "Looking at your photo." |
| Slow model | "Still working. This can take up to 30 seconds." |
| Model timeout (504) | "The model took too long to answer. Please try again." |
| Model down (503) | "The model is unavailable right now. Please try again later." |
| Offline | "We couldn't connect to AskSight. Check your internet connection and try again." |
| Rate limited (429) | "Too many requests. Please wait a moment and try again." |
| TTS unavailable | "The answer is on screen, but the voice is unavailable right now. You can read it or try Listen Again." |
| History not saved (500) | "This answer couldn't be saved to your history. You can still read it." |
| Image gone (404) | "This image is no longer available. Please upload it again." |
| Deleting all | "This deletes every question, answer, and photo in your history. It cannot be undone." |

---

## 10. Accessibility acceptance checklist

Ship nothing until every line passes on a real device.

**Perceivable**

- [ ] Body text ≥ 20 px, answer ≥ 30 px, at default system scale.
- [ ] OS text scaling to 200% does not clip, overlap, or hide an action.
- [ ] Text contrast ≥ 4.5:1; icons/borders ≥ 3:1; no colour-only meaning.
- [ ] All images that carry meaning have a label; decorative shapes are hidden.
- [ ] Screen orientation changes do not lose state or cut off content.

**Operable**

- [ ] Every action reachable with one finger, no gesture required.
- [ ] Every target ≥ 48 × 48 dp with ≥ 8 dp gaps.
- [ ] Modal camera/ask flows have a visible Close, not gesture-dismiss only.
- [ ] No timed auto-advance, auto-submit, or auto-dismiss anywhere.
- [ ] Focus order matches visual order; focus is not trapped.
- [ ] Screen-reader focus moves to the meaningful result after each step.
- [ ] Playback has Stop at the same position as Listen Again.

**Understandable**

- [ ] Every screen has a spoken title and purpose.
- [ ] Errors are announced and name the next step.
- [ ] Destructive actions confirm and name what will be deleted.
- [ ] Permissions are explained before the OS prompt; denial has a recovery path.
- [ ] Loading states announce start and completion; no silent waits.
- [ ] The verification note is present wherever an answer is shown.

**Robust**

- [ ] VoiceOver (iOS) and TalkBack (Android) pass the full journey: sign in →
  photo → question → answer → replay → history → delete.
- [ ] VoiceOver/TalkBack with the screen curtain on: journey still completes.
- [ ] Airplane mode mid-journey: error is understandable, no data loss, retry
  works.
- [ ] Interrupted TTS (call, notification, Bluetooth change) does not break the
  screen or lose the answer.
- [ ] Dark mode / inverted colours remain legible (system theme).
- [ ] Reduced motion removes non-essential animation.
- [ ] `expo lint`, `tsc --noEmit`, and component tests pass; new screens have
  tests for their loading/error/empty states.

**Manual**

- [ ] One usability session with a blind or low-vision user; notes recorded.
- [ ] Braille display check: answer and error text are complete, not visual-only.

---

## 11. Mapping to the remaining UI work

The UI track in [docs/Task.md](docs/Task.md) is still mostly pending. This
design maps to it as follows:

| Task | Design sections |
|---|---|
| C1 camera + library + upload | 7.3, 7.4 |
| C2 voice input + transcript | 7.5, 7.6 |
| C3 answer + playback | 7.7, 7.8 |
| C4 history + session persistence | 7.1 (persistence), 7.9, 7.10 |
| C5 device accessibility verification | 4, 10 |
| C6 mobile tests | 10 |
| C7 release config (name, permissions, URLs) | 7.3, 7.11, 10 |

**Already built:** sign-in, sign-up, Home, History empty state, Settings shell,
tab navigation, the API error mapper, and the visual tokens above.
**Not built:** camera, library picker, microphone, audio playback, upload/ask/
history wiring, refresh-token persistence, consent screen, and the new
accessibility settings.

**API client gap:** `ui/src/lib/api.ts` currently has only `signup`, `login`,
and `me`. It needs `refresh`, `logout`, `uploadImage`, `getImage`,
`ask`, `transcribe`, `synthesize`, `listHistory`, `getHistoryEntry`, and the
delete calls, each keeping the same friendly-error rule.

**Packages to add (Expo SDK 57):** `expo-camera`, `expo-image-picker`,
`expo-audio` (recording + playback), `expo-secure-store` (refresh token),
`expo-haptics` (optional). Follow `ui/AGENTS.md`: install with
`npx expo install`, verify against the versioned Expo docs, and use a
development build because these modules are not all in Expo Go.

---

## 12. Deliberately out of scope

- A confidence percentage or "certainty" badge — no calibrated score exists.
- Multilingual answers — the model is English-only today.
- Multi-turn conversation memory — each question is independent.
- Continuous live scene description / video — the product is photo-then-ask.
- Full-document OCR reading — the model answers short questions, it does not
  transcribe pages.
- Offline answers — inference is server-side; the app should still work offline
  for typing and browsing cached history.
- Voice-only navigation without any screen — screen readers already provide
  that, and a parallel custom voice UI would duplicate it.

**Open decisions:** app display name and icons (still `ui`), production API URL,
spoken-language list once Sarvam is verified, speech-rate defaults, and whether
the verification note appears on every answer or only in Help.

---

*This document describes the intended UI; none of the camera, voice, answer,
history, consent, or settings work above is implemented yet. The backend and
model behaviour it relies on is implemented and covered by tests, except the
release checkpoint quality, which is still pending a full GPU training run.*
