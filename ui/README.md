# AskSight mobile app

Expo + React Native client for AskSight. The visual flow is:

```
Login / Sign up  ->  Home  ->  History
                        \->  Account
```

Login and sign up are wired to the FastAPI backend. Camera capture, voice
input, history data and the account preference rows are design placeholders
for the next phase.

## Run it

1. Install dependencies:

   ```bash
   cd ui
   npm install
   ```

2. Point the app at the backend. Copy `.env.example` to `.env` and set the
   URL reachable from your device:

   ```bash
   cp .env.example .env
   ```

   - Android emulator: `http://10.0.2.2:8000` (the default when unset)
   - iOS simulator or web: `http://localhost:8000`
   - Physical phone: `http://<your-computer-LAN-IP>:8000`

3. Start the backend from `backend/` (see `backend/README.md`), then start
   Expo:

   ```bash
   npx expo start
   ```

## Auth behaviour

- `POST /auth/signup` creates the account, then the app signs in with the same
  credentials and lands on Home.
- `POST /auth/login` stores the refresh token in secure storage (localStorage
  on web) and loads the profile from `GET /auth/me`.
- On a cold start the stored refresh token is rotated through
  `POST /auth/refresh`, so a returning user goes straight to Home.
- Sign out clears the local session and revokes the refresh token.

## Checks

```bash
npx tsc --noEmit
npx expo export --platform web
```
