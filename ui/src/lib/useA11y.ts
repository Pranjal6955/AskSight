import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, AppState, Platform } from "react-native";

import { announce } from "./a11y";

type AnnounceOptions = Parameters<typeof announce>[1];

// null means "not known yet": auto-speak and other behaviours must wait for the
// first answer instead of assuming no screen reader is running.
export function useScreenReader(): boolean | null {
  const [enabled, setEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;

    void AccessibilityInfo.isScreenReaderEnabled()
      .then((value) => {
        if (active) setEnabled(value);
      })
      .catch(() => {});

    const subscription = AccessibilityInfo.addEventListener(
      "screenReaderChanged",
      setEnabled,
    );

    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  return enabled;
}

export function useReduceMotion(): boolean {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    let active = true;

    void AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (active) setEnabled(value);
      })
      .catch(() => {});

    const subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setEnabled,
    );

    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  return enabled;
}

function queryHighContrast(): Promise<boolean> {
  if (Platform.OS === "android") {
    return AccessibilityInfo.isHighTextContrastEnabled();
  }
  if (Platform.OS === "ios") {
    return AccessibilityInfo.isDarkerSystemColorsEnabled();
  }
  return Promise.resolve(false);
}

// React Native exposes no high-contrast change event, so re-query whenever the
// app returns to the foreground.
export function useHighContrast(): boolean {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    let active = true;

    function refresh() {
      void queryHighContrast()
        .then((value) => {
          if (active) setEnabled(value);
        })
        .catch(() => {});
    }

    refresh();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") refresh();
    });

    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  return enabled;
}

export function useAnnounceOnMount(message: string, options?: AnnounceOptions) {
  const messageRef = useRef(message);
  const optionsRef = useRef(options);

  useEffect(() => {
    announce(messageRef.current, optionsRef.current);
  }, []);
}
