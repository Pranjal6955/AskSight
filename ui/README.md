# AskSight mobile app

Expo + React Native client for AskSight. The visual flow is:

```
Login / Sign up  ->  Home  ->  History
                        \->  Account
```

Every request — accounts, image storage, questions, speech input/output, and
history — goes to the FastAPI backend. The backend calls the Hugging Face Space
for model inference.

## Run it

1. Install dependencies:

   ```bash
   cd ui
   npm install
   ```

2. Copy `.env.example` to `.env`. Leave `EXPO_PUBLIC_API_URL` empty for local
   Expo development, or set it to the HTTPS URL of your deployed FastAPI
   backend:

   ```bash
   cp .env.example .env
   ```

3. Start the FastAPI backend first. Follow the setup in
   [`backend/README.md`](../backend/README.md), and run it with
   `--host 0.0.0.0 --port 8000` so a phone on the same Wi-Fi can reach it.

4. Start Expo and reload the app after changing `.env`:

   ```bash
   npx expo start --clear
   ```

For local device testing, keep the phone and development computer on the same
Wi-Fi. Expo development builds discover the computer's host from the dev
server; Android emulators use `10.0.2.2` when that host is unavailable.

The FastAPI backend proxies image questions to the public Space at
`https://pranjal7777-asksight.hf.space`; the app never calls the Space directly.
Every answer is saved to history and every image is stored by the backend. See
the [Space API schema](https://pranjal7777-asksight.hf.space/gradio_api/openapi.json).

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
npm run lint
npm run format:check
npx tsc --noEmit
npx expo export --platform web
```

Run `npm run format` to apply Prettier formatting.
