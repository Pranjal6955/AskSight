import * as SecureStore from "expo-secure-store";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import { useScreenReader } from "./useA11y";

const SETTINGS_KEY = "asksight.settings";

export type TextScale = "system" | "large" | "xlarge";

export type Settings = {
  speakAutomatically: boolean;
  speechRate: 0.8 | 1 | 1.2;
  textScale: TextScale;
  speechLanguage: string;
  consentGiven: boolean;
};

export const DEFAULT_SETTINGS: Settings = {
  speakAutomatically: true,
  speechRate: 1,
  textScale: "system",
  speechLanguage: "en-IN",
  consentGiven: false,
};

const TEXT_SCALE: Record<TextScale, number> = {
  system: 1,
  large: 1.15,
  xlarge: 1.3,
};

type SettingsValue = {
  settings: Settings;
  ready: boolean;
  update: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
};

const SettingsContext = createContext<SettingsValue>({
  settings: DEFAULT_SETTINGS,
  ready: false,
  update: () => {},
});

// Stored JSON is trusted only after validation: a corrupt or older value must
// fall back to defaults instead of breaking startup.
function sanitize(value: unknown): Settings {
  const raw =
    typeof value === "object" && value !== null
      ? (value as Partial<Settings>)
      : {};
  const rate: Settings["speechRate"] =
    raw.speechRate === 0.8 || raw.speechRate === 1 || raw.speechRate === 1.2
      ? raw.speechRate
      : DEFAULT_SETTINGS.speechRate;

  return {
    speakAutomatically:
      typeof raw.speakAutomatically === "boolean"
        ? raw.speakAutomatically
        : DEFAULT_SETTINGS.speakAutomatically,
    speechRate: rate,
    textScale:
      raw.textScale === "large" || raw.textScale === "xlarge"
        ? raw.textScale
        : "system",
    speechLanguage:
      typeof raw.speechLanguage === "string" &&
      raw.speechLanguage.trim().length > 0
        ? raw.speechLanguage
        : DEFAULT_SETTINGS.speechLanguage,
    consentGiven:
      typeof raw.consentGiven === "boolean"
        ? raw.consentGiven
        : DEFAULT_SETTINGS.consentGiven,
  };
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        const stored = await SecureStore.getItemAsync(SETTINGS_KEY);
        const parsed: unknown = stored ? JSON.parse(stored) : null;
        if (active && parsed) setSettings(sanitize(parsed));
      } catch {
        // Unreadable storage or corrupt JSON: keep defaults.
      } finally {
        if (active) setReady(true);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  const update = useCallback(
    <K extends keyof Settings>(key: K, value: Settings[K]) => {
      setSettings((current) => {
        const next = { ...current, [key]: value };
        void SecureStore.setItemAsync(SETTINGS_KEY, JSON.stringify(next)).catch(
          () => {},
        );
        return next;
      });
    },
    [],
  );

  return (
    <SettingsContext.Provider value={{ settings, ready, update }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  return useContext(SettingsContext);
}

export function useTextScale() {
  return TEXT_SCALE[useContext(SettingsContext).settings.textScale];
}

// Auto-speak waits for screen-reader detection to finish and never starts when
// a screen reader is active, regardless of the stored preference.
export function useAutoSpeak() {
  const { settings } = useSettings();
  const screenReader = useScreenReader();
  return settings.speakAutomatically && screenReader === false;
}
