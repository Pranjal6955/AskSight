This is an Expo/React Native mobile application. Prioritize mobile-first patterns, performance, and cross-platform compatibility.

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

## Commands

Use `bunx` instead of `npx` if the project uses bun (`bun.lock` present).

```bash
npx expo install <package>  # ALWAYS use instead of npm/yarn/pnpm/bun add — resolves SDK-compatible versions
npx expo start              # start the dev server
npx expo lint               # lint
npx tsc --noEmit            # typecheck
npx expo-doctor             # diagnose dependency and config issues
npx expo install --fix      # fix incompatible package versions
```

Run lint and typecheck before declaring any task done.

## Navigation & Routing

- Use **Expo Router** for all navigation. Routes live in `src/app/` — every file there is a screen, `_layout.tsx` files define navigators. Keep non-route code (components, hooks, utils) outside `src/app/`.
- Import `Link`, `router`, and `useLocalSearchParams` from `expo-router`.
- Docs: https://docs.expo.dev/router/introduction.md

## Design system

`design.md` is the visual and accessibility specification; `plan.md` sequences the work. The tokens below live in `ui/tailwind.config.js` — use these class names in new code instead of raw hex values.

### Colour

| Class                                       | Hex       | Use                                   |
| ------------------------------------------- | --------- | ------------------------------------- |
| `bg-canvas`                                 | `#FAF7F0` | App background                        |
| `bg-white` / `bg-input`                     | `#FFFFFF` | Cards, fields, banners                |
| `text-ink` / `bg-brand`                     | `#000000` | Headings, body, primary button        |
| `text-muted` / `text-hint`                  | `#404040` | Supporting text, icons                |
| `border-inputBorder` / `border-fieldBorder` | `#737373` | Control borders (≥ 3:1)               |
| `bg-field` / `bg-card-*` / `bg-avatar`      | `#F2F2F2` | Neutral surfaces                      |
| `text-error` / `border-error`               | `#B42318` | Errors (≥ 4.5:1)                      |
| `text-success` / `border-success`           | `#166534` | Success (≥ 4.5:1)                     |
| `bg-warning`                                | `#FACC15` | Busy button surface — black text only |
| `focus`                                     | `#000000` | Keyboard focus outline                |

Rules:

- Text is never lighter than `#404040` on canvas or white. Disabled state changes the surface (`bg-brand-muted`), never dims the text below 4.5:1.
- One primary action per screen: black `bg-brand`; everything else is outlined (`SecondaryButton`) or plain.
- Status is always icon + text + colour, never colour alone. Never put white text on `warning`.
- Control borders are 2 px; 1 px is decorative only. Destructive actions use `error` and require `ConfirmDialog`.
- `global.css` handles focus rings, reduced motion, and high contrast on web. On native, read `useHighContrast()` / `useReduceMotion()` from `src/lib/useA11y.ts` and remove non-essential motion.
- `home.tsx` still contains raw hex values from an earlier design; migrate them to the tokens above when that screen is next edited. Do not copy its hex values.

### Typography

All text uses `AppText` from `src/components/AppText.tsx`; it applies the user's text-size setting on top of OS scaling.

| Variant      | Size / line height | Weight | Use                                          |
| ------------ | ------------------ | ------ | -------------------------------------------- |
| `hero`       | 36 / 40            | 700    | Screen title, greeting                       |
| `title`      | 30 / 36            | 700    | Dialog titles                                |
| `section`    | 22 / 28            | 700    | Section and card headings                    |
| `answer`     | 22 / 30            | 400    | The answer (never smaller than the question) |
| `bodyLarge`  | 20 / 28            | 400    | Instructions, errors, primary readable copy  |
| `body`       | 16 / 24            | 400    | Compact body copy                            |
| `supporting` | 14 / 20            | 400    | Secondary metadata                           |
| `caption`    | 12 / 16            | 400    | Dates, version, labels                       |

- Text scales: `system` 1×, `large` 1.15×, `xlarge` 1.3×. No fixed-height text containers; let text wrap.
- Use `bodyLarge` or larger for anything the user must read to complete the task. `body`/`supporting`/`caption` are for secondary information.
- Legacy auth screens still use React Native `Text` directly until Phase 5; do not copy that pattern into new screens.

### Spacing, shape, targets

- Spacing steps: 4, 8, 12, 16, 20, 24, 32, 40. Screen padding: 24 horizontal, 24–32 vertical. Page content caps at `max-w-[560px]`, auth forms at `max-w-[480px]`.
- Radii: `rounded-card` 20, `rounded-field` 12, hero cards 28–30, pills `rounded-full`.
- Minimum target 44×44 (`touch-target`); primary buttons are taller, and gaps between adjacent targets are at least 8.
- Screens use `SafeAreaView` + `ScrollView`; never rely on a gesture as the only route to an action.

### Components

Reuse these instead of re-implementing:

| Component           | Use                                                            |
| ------------------- | -------------------------------------------------------------- |
| `AppText`           | Every piece of text                                            |
| `ScreenHeader`      | Screen title + optional subtitle                               |
| `ActionCard`        | Large, whole-card tappable action (icon + title + description) |
| `PrimaryButton`     | The one primary action; handles loading/busy state             |
| `SecondaryButton`   | Outlined alternative action                                    |
| `StatusBanner`      | Inline error/success/info; announces and never auto-dismisses  |
| `ConfirmDialog`     | Destructive confirmation; names the consequence                |
| `ProgressAnnouncer` | Spoken progress for long requests (no visual output)           |
| `AuthField`         | Labelled form input with error association (auth pattern)      |

### Accessibility rules

- Every state change is spoken: use `announce`, `focus`, and `describeDate` from `src/lib/a11y.ts`, or `useAnnounceOnMount` from `src/lib/useA11y.ts`.
- Show backend `detail` sentences verbatim; never invent or prefix technical wording. No confidence UI anywhere.
- Icon-only controls need an `accessibilityLabel`; decorative icons use `importantForAccessibility="no-hide-descendants"`.
- Screen-reader order matches visual order. Move focus to the meaningful result after each step, not to decorative text.
- Loading and error states are required for every async screen; no silent waits and no auto-dismissing messages.
- New screens need tests for their loading, error, and empty states. Target sizes and contrast are non-negotiable, not polish.

### Assets

Keep only referenced files in `ui/assets/`; import icons from `@expo/vector-icons/MaterialCommunityIcons` rather than adding images. `icon.png` and `splash-icon.png` are still stock Expo artwork — replace them with AskSight branding before release. Text must never be baked into an image.

## Building with EAS

Use EAS to build, sign, and submit the app in the cloud (`eas build`, `eas submit`) and to ship over-the-air updates (`eas update`) — no local Xcode or Android Studio required. Run EAS CLI as `bunx eas-cli <command>` in Bun projects, or `npx eas-cli@latest <command>` otherwise; substitute that for bare `eas` in docs examples.
Docs: https://docs.expo.dev/eas/index.md

## Rules

- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build: `npx expo run:ios|android` locally, or `eas build --profile development`.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md
