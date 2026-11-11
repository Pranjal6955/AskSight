# AskSight API Contract

**Status:** agreed, implemented on the branch that carries this file.
**Last updated:** 11 November 2026

This is the contract the mobile app codes against. It is the source of truth for
request/response shapes, status codes, error bodies, pagination and upload
fields. Change it here first, then in code.

---

## 1. Conventions

### Base URL

No version prefix. All routes are unprefixed, matching the `/auth/*` routes
that already ship. The mobile client calls `EXPO_PUBLIC_API_URL` + path.

**Decision:** keep the unprefixed convention. A `/api/v1` prefix was proposed
in the original phase plan; adopting it now would split the API across two
conventions and force a breaking change on every existing route later. If a
version prefix is ever wanted, it should be introduced for *all* routes at
once, with the mobile client updated in the same change.

### Authentication

All routes except `POST /auth/signup`, `POST /auth/login` and the health
routes require a bearer token:

```
Authorization: Bearer <access_token>
```

Tokens are HS256 JWTs carrying `sub` (user id) and `exp`, with a **30-minute**
lifetime. There is **no refresh endpoint and no refresh token**. The mobile app
holds the token in memory only; a cold start returns the user to the sign-in
screen, and a 401 shows "Your session has expired. Please sign in again."

**Decision:** no refresh tokens. They add storage, rotation and revocation
surface for a demo-grade session. Revisit only if user testing shows people
sign in several times per session.

### Errors

Every error body is:

```json
{ "detail": "Could not read the image. Please retake the photo and try again." }
```

`detail` is always a **complete, human-readable sentence** for errors we
raise — no status codes, no field paths, no stack traces. The mobile client
shows `detail` verbatim, so the backend owns the wording.

FastAPI's built-in request-validation failures (422) keep their array form:

```json
{ "detail": [{ "loc": ["body", "email"], "msg": "value is not a valid email address" }] }
```

The mobile client maps these to friendly sentences already.

Status codes used:

| Code | Meaning |
|---|---|
| 200 / 201 | Success (`201` only on signup and image upload) |
| 401 | Missing, malformed, or expired token; wrong credentials |
| 404 | Resource does not exist **or** belongs to another user |
| 409 | Email already registered |
| 413 | Upload larger than the size limit |
| 415 | Unsupported content type |
| 422 | Body failed validation, or the image/audio could not be decoded |
| 429 | Rate limit exceeded |
| 502 / 503 | Upstream provider (Sarvam, model) failed or is unavailable |
| 504 | Upstream provider timed out |

**Ownership rule:** a resource owned by another user returns **404, not 403**.
A 403 tells an attacker that the id exists.

### Request IDs

Every response carries `X-Request-ID` (a UUID4). Clients may send their own;
otherwise the server generates one. The id is echoed in error bodies' logs and
is the key for correlating a mobile report with a server log line.

### Limits

| Thing | Limit | Enforced |
|---|---|---|
| Image upload | 10 MB, JPEG/PNG only | `POST /images`, `POST /ask` (image path) |
| Question | 1–500 characters, non-blank | `POST /ask` |
| Audio upload | 15 MB | `POST /stt` |
| TTS text | 1–2000 characters | `POST /tts` |
| Page size | 1–50, default 20 | `GET /history` |

### Model versioning

Every answer records the `model_version` that produced it (`v0.1-colab`,
`mock-0.0.0`, …). It is returned in the ask response and stored on the history
entry, so a past answer can always be traced to the checkpoint that made it.

---

## 2. Health

Unauthenticated. Exposes no secrets.

### `GET /health/live`

```json
{ "status": "ok" }
```

Process is up. Always 200 if the process can serve traffic.

### `GET /health/ready`

```json
{ "status": "ok", "checks": { "database": "ok", "model": "ok" } }
```

`200` when the database is reachable and the inference service has loaded;
`503` otherwise, with the failing check reported as `"unavailable"`. The
inference service reports `"mock"` when running the development placeholder.

---

## 3. Authentication

### `POST /auth/signup`

```json
{ "name": "Ada Lovelace", "email": "ada@example.com", "password": "password123" }
```

| Field | Rules |
|---|---|
| `name` | 2–100 characters, trimmed |
| `email` | valid email, lowercased before storage |
| `password` | 8–128 characters |

**201**

```json
{ "id": "clx...", "name": "Ada Lovelace", "email": "ada@example.com", "createdAt": "2026-11-11T09:00:00Z" }
```

**409** — email already registered. **422** — validation failed.

Signup does not return a token; the client calls `/auth/login` immediately after.

### `POST /auth/login`

```json
{ "email": "ada@example.com", "password": "password123" }
```

**200**

```json
{ "access_token": "<jwt>", "token_type": "bearer" }
```

**401** — email or password wrong. The message does not say which.

### `GET /auth/me`

**200** — same body as signup. **401** — token invalid or expired.

---

## 4. Images

Images are uploaded once and then referenced by id, so several questions can
be asked about the same photo without re-uploading it.

### `POST /images`

`multipart/form-data`

| Field | Type | Notes |
|---|---|---|
| `file` | file | required. JPEG or PNG, ≤ 10 MB |

**201**

```json
{ "id": "clx...", "mime_type": "image/jpeg", "size_bytes": 284193, "width": 1024, "height": 768, "created_at": "2026-11-11T09:01:00Z" }
```

**413** — over the size limit. **415** — not JPEG/PNG. **422** — could not be
decoded, or empty.

Validation is on the **decoded** bytes, not the filename or the declared
content type: the file is decoded with Pillow and the real format is checked.
A `.png` file containing JPEG bytes is accepted as JPEG and stored as such; a
file that is not an image at all is rejected. The client-provided filename is
**never** used as a path.

**Decision — storage:** local disk under `backend/storage/` for development,
behind a small `app/core/storage.py` interface (`save` / `read` / `delete`) so
object storage can be swapped in for production without touching the routes.
Storage keys are opaque (`<uuid4-hex>.<ext>`) and never derived from
user-supplied names. `STORAGE_BACKEND` and `STORAGE_ROOT` are read from the
environment.

**Decision — retention:** stored images are deleted **24 hours** after upload.
Photos of people are sensitive, and a visually impaired user's camera is
often pointed at other people; a short automatic lifetime is the safe default
for a demo that stores real photographs. The Q&A text is kept for 30 days. The
user can delete any entry, or everything, immediately — deletion removes the
image bytes and the database row together.

### `GET /images/{image_id}`

Returns the raw bytes with `Content-Type` set to the stored MIME type.

**200** — image bytes. **404** — unknown id, or owned by another user.

The mobile app uses this to show the photo it asked about. Bytes go through the
API rather than a signed URL: the images are private, short-lived, and the app
already authenticates every request, so a second auth mechanism would add
complexity for no gain.

---

## 5. Speech-to-text (Sarvam proxy)

The API key stays server-side. The mobile app never sees it.

### `POST /stt`

`multipart/form-data`

| Field | Type | Notes |
|---|---|---|
| `file` | file | required. Recorded audio, ≤ 15 MB |

**200**

```json
{ "transcript": "what does this sign say", "language": "en-IN" }
```

`language` is the language the audio was spoken in, preserved from the audio
where the provider can detect it.

**413** — over the size limit. **415** — unsupported audio format. **422** —
undecodable audio. **502 / 504** — the provider failed or timed out.

**Decision:** the STT provider is called behind a service module with the same
interface as a mock, so tests never call Sarvam and the endpoint works in
development without a key. `SARVAM_API_KEY` is optional at boot; when it is
absent the endpoint returns **503** with a clear message rather than failing
obscurely.

---

## 6. Text-to-speech (Sarvam proxy)

### `POST /tts`

`application/json`

```json
{ "text": "The sign says no parking.", "language": "en-IN", "voice": "female" }
```

| Field | Rules |
|---|---|
| `text` | 1–2000 characters |
| `language` | optional, defaults to `en-IN` |
| `voice` | optional, provider default when omitted |

**200** — audio bytes.

```
Content-Type: audio/mpeg
```

**422** — empty or oversized text. **502 / 504** — provider failed or timed
out. **503** — no API key configured.

Generated speech is returned as bytes, not base64 inside JSON — a base64
payload would inflate it by a third and force the whole clip through memory.
Speech is not stored on the server; it is generated per request and discarded.

---

## 7. Ask

### `POST /ask`

`multipart/form-data` (form fields, no file — the image was uploaded already)

| Field | Type | Notes |
|---|---|---|
| `image_id` | string | required. An image owned by the caller |
| `question` | string | required. 1–500 characters, non-blank |

**200**

```json
{
  "entry_id": "clx...",
  "answer": "The sign says no parking.",
  "model_version": "v0.1-colab",
  "created_at": "2026-11-11T09:02:00Z",
  "request_id": "3f2a..."
}
```

**401** — not authenticated. **404** — unknown `image_id` or owned by another
user. **422** — blank or oversized question. **503** — the inference service
is unavailable. **504** — the model timed out.

The call persists the question, the answer, the image association, the
timestamp and the model version, and returns the new history entry id so the
app can navigate to it.

There is deliberately **no confidence score** in the response. A number that
has not been calibrated against real data is worse than no number — the app
would present a fabricated certainty to a user who cannot check it. The
"please verify this" prompt is driven by the measured image-quality results
from the model track, not by an invented per-answer probability.

**Decision:** the image is uploaded separately rather than posted inline with
the question. It keeps one code path for the "ask another question about the
same photo" flow, avoids re-uploading megabytes for a follow-up, and lets the
API measure upload latency separately from inference latency.

---

## 8. History

### `GET /history`

Query parameters:

| Name | Default | Notes |
|---|---|---|
| `limit` | 20 | 1–50 |
| `cursor` | — | opaque cursor from a previous page |
| `image_id` | — | optional filter, one image's questions |

**200**

```json
{
  "items": [
    {
      "id": "clx...",
      "question": "what does this sign say",
      "answer": "The sign says no parking.",
      "image_id": "clx...",
      "image_url": "/images/clx...",
      "model_version": "v0.1-colab",
      "created_at": "2026-11-11T09:02:00Z"
    }
  ],
  "next_cursor": "eyJjcmVhdGVkX2F0IjoiMjAyNi0xMS0xMVQwOToyMDowMFoifQ",
  "has_more": true
}
```

Cursor pagination, newest first. `next_cursor` is `null` on the last page.
Entries are always scoped to the authenticated user; there is no way to read
another user's history.

**401** — not authenticated.

### `GET /history/{entry_id}`

**200** — one entry, same shape as an item above. **404** — unknown id or
owned by another user.

### `DELETE /history/{entry_id}`

Deletes the entry. **204** on success. **404** — unknown id or owned by
another user.

The image is **not** deleted with the entry: a user who deletes one question
may still want to ask another about the same photo. The image is removed when
no entry references it any more, when it passes its 24-hour expiry, or when
the user deletes everything.

### `DELETE /history`

Deletes every history entry and image owned by the user. **204** on success.

---

## 9. Data model

```
User
  id, name, email, password (hashed), createdAt

Image
  id, ownerId -> User
  storageKey (opaque, unique)
  mimeType, sizeBytes, width, height
  createdAt
  expiresAt          # createdAt + 24h

HistoryEntry
  id, ownerId -> User
  imageId -> Image
  question
  answer
  modelVersion
  createdAt
  expiresAt          # createdAt + 30d
```

Deleting a user cascades to their images and history entries, and the image
bytes are removed from storage.

---

## 10. Open items

| Item | Status |
|---|---|
| Upload limit of 10 MB | assumed from the product brief; **no PRD exists in the repo** to confirm it |
| Retention windows (24 h image / 30 d text) | our decision, not from a PRD |
| Session-based API examples in the original brief | not implemented — this API is token-based, matching the code that already ships |
| `< 3s` inference / `< 5s` voice round-trip | targets to measure, not yet met |
| Confirmation prompt | the model returns a clarification answer when its output is empty; a confidence-driven clarification is not built |
