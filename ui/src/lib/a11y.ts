import { AccessibilityInfo, Platform } from "react-native";

type HostHandle = Parameters<
  typeof AccessibilityInfo.sendAccessibilityEvent
>[0];

type AnnounceOptions = {
  priority?: "low" | "default" | "high";
  queue?: boolean;
};

// Android has no priority option; iOS has no plain equivalent, so route each
// platform to the API it actually supports.
export function announce(message: string, options: AnnounceOptions = {}) {
  if (!message) return;
  if (Platform.OS === "ios") {
    AccessibilityInfo.announceForAccessibilityWithOptions(message, options);
    return;
  }
  AccessibilityInfo.announceForAccessibility(message);
}

// setAccessibilityFocus is deprecated; "focus" is the supported replacement.
export function focus(handle: HostHandle) {
  AccessibilityInfo.sendAccessibilityEvent(handle, "focus");
}

// "Today at 2:15 PM" for recent entries, a plain date for older ones.
export function describeDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "an unknown time";

  const now = new Date();
  const time = date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });

  if (date.toDateString() === now.toDateString()) return `Today at ${time}`;

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) {
    return `Yesterday at ${time}`;
  }

  const day = date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "long",
    ...(date.getFullYear() === now.getFullYear()
      ? {}
      : { year: "numeric" as const }),
  });
  return `${day} at ${time}`;
}
