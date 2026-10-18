import { useEffect, useRef } from "react";
import {
  Keyboard,
  Platform,
  type FocusEvent,
  type ScrollView,
} from "react-native";

// On Android 15+ edge-to-edge (Expo SDK 54+) the window no longer resizes
// when the keyboard opens, so RN only emits keyboard events. This hook keeps
// the focused field above the keyboard: it remembers the last focused field
// and, once the keyboard is up, scrolls just enough to reveal it. iOS needs
// none of this — ScrollView's automaticallyAdjustKeyboardInsets does it
// natively, and re-running it here would double-scroll.
export function useKeyboardAwareScroll() {
  const scrollRef = useRef<ScrollView>(null);
  const focusedField = useRef<number | null>(null);

  useEffect(() => {
    if (Platform.OS !== "android") return;

    const subscription = Keyboard.addListener("keyboardDidShow", () => {
      const handle = focusedField.current;
      const scrollView = scrollRef.current;
      const nativeScrollView = scrollView?.getNativeScrollRef();
      if (handle == null || scrollView == null || nativeScrollView == null) {
        return;
      }

      // The scroll target is computed in the ScrollView's coordinate space,
      // so add the ScrollView's own screen offset back in, plus a little
      // breathing room below the field.
      nativeScrollView.measureInWindow((_x, y) => {
        scrollView.scrollResponderScrollNativeHandleToKeyboard(
          handle,
          y + 24,
          true,
        );
      });
    });

    return () => subscription.remove();
  }, []);

  function trackFocus(event: FocusEvent) {
    focusedField.current = event.nativeEvent.target;
  }

  return { scrollRef, trackFocus };
}
