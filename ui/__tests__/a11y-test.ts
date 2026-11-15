import { act, renderHook, waitFor } from "@testing-library/react-native";
import { AccessibilityInfo, AppState, Platform } from "react-native";

import { announce, describeDate, focus } from "../src/lib/a11y";
import {
  useAnnounceOnMount,
  useHighContrast,
  useReduceMotion,
  useScreenReader,
} from "../src/lib/useA11y";

type EventHandler = (enabled: boolean) => void;

afterEach(() => jest.restoreAllMocks());

describe("announce", () => {
  test("uses priority options on iOS", () => {
    jest.replaceProperty(Platform, "OS", "ios");
    const ios = jest.spyOn(
      AccessibilityInfo,
      "announceForAccessibilityWithOptions",
    );
    const android = jest.spyOn(AccessibilityInfo, "announceForAccessibility");

    announce("Photo ready", { priority: "high", queue: true });

    expect(ios).toHaveBeenCalledWith("Photo ready", {
      priority: "high",
      queue: true,
    });
    expect(android).not.toHaveBeenCalled();
  });

  test("supports an assertive announcement shorthand on iOS", () => {
    jest.replaceProperty(Platform, "OS", "ios");
    const ios = jest.spyOn(
      AccessibilityInfo,
      "announceForAccessibilityWithOptions",
    );

    announce("Permission needed", true);

    expect(ios).toHaveBeenCalledWith("Permission needed", {
      priority: "high",
    });
  });

  test("uses the plain API on Android", () => {
    jest.replaceProperty(Platform, "OS", "android");
    const ios = jest.spyOn(
      AccessibilityInfo,
      "announceForAccessibilityWithOptions",
    );
    const android = jest.spyOn(AccessibilityInfo, "announceForAccessibility");

    announce("Photo ready");

    expect(android).toHaveBeenCalledWith("Photo ready");
    expect(ios).not.toHaveBeenCalled();
  });

  test("ignores an empty message", () => {
    const android = jest.spyOn(AccessibilityInfo, "announceForAccessibility");
    announce("");
    expect(android).not.toHaveBeenCalled();
  });
});

describe("focus", () => {
  test("sends the focus accessibility event", () => {
    const send = jest.spyOn(AccessibilityInfo, "sendAccessibilityEvent");
    const handle = {} as Parameters<typeof focus>[0];

    focus(handle);

    expect(send).toHaveBeenCalledWith(handle, "focus");
  });
});

describe("describeDate", () => {
  test("names today and yesterday", () => {
    expect(describeDate(new Date().toISOString())).toMatch(/^Today at /);

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    expect(describeDate(yesterday.toISOString())).toMatch(/^Yesterday at /);
  });

  test("includes the year for an older date", () => {
    const old = new Date("2020-11-15T14:15:00Z");
    const text = describeDate(old.toISOString());
    expect(text).toContain("2020");
    expect(text).toContain(" at ");
  });

  test("falls back for an invalid date", () => {
    expect(describeDate("not-a-date")).toBe("an unknown time");
  });
});

describe("useScreenReader", () => {
  test("reports readiness, updates on change, and unsubscribes", async () => {
    let listener: EventHandler | null = null;
    const remove = jest.fn();
    jest
      .spyOn(AccessibilityInfo, "isScreenReaderEnabled")
      .mockResolvedValue(true);
    jest
      .spyOn(AccessibilityInfo, "addEventListener")
      .mockImplementation((_event, handler) => {
        listener = handler as unknown as EventHandler;
        return { remove } as unknown as ReturnType<
          typeof AccessibilityInfo.addEventListener
        >;
      });

    const { result, unmount } = renderHook(() => useScreenReader());
    expect(result.current).toBeNull();

    await waitFor(() => expect(result.current).toBe(true));

    act(() => listener?.(false));
    expect(result.current).toBe(false);

    unmount();
    expect(remove).toHaveBeenCalled();
  });

  test("keeps the state unknown when the screen-reader query fails", async () => {
    jest
      .spyOn(AccessibilityInfo, "isScreenReaderEnabled")
      .mockRejectedValue(new Error("unsupported"));
    jest
      .spyOn(AccessibilityInfo, "addEventListener")
      .mockReturnValue({ remove: jest.fn() } as unknown as ReturnType<
        typeof AccessibilityInfo.addEventListener
      >);

    const { result } = renderHook(() => useScreenReader());

    await waitFor(() => expect(result.current).toBeNull());
  });
});

describe("useReduceMotion", () => {
  test("reads the current preference", async () => {
    jest
      .spyOn(AccessibilityInfo, "isReduceMotionEnabled")
      .mockResolvedValue(true);
    jest
      .spyOn(AccessibilityInfo, "addEventListener")
      .mockReturnValue({ remove: jest.fn() } as unknown as ReturnType<
        typeof AccessibilityInfo.addEventListener
      >);

    const { result } = renderHook(() => useReduceMotion());

    await waitFor(() => expect(result.current).toBe(true));
  });
});

describe("useHighContrast", () => {
  test("queries the Android high-text-contrast setting", async () => {
    jest.replaceProperty(Platform, "OS", "android");
    jest
      .spyOn(AccessibilityInfo, "isHighTextContrastEnabled")
      .mockResolvedValue(true);
    jest
      .spyOn(AppState, "addEventListener")
      .mockReturnValue({ remove: jest.fn() } as unknown as ReturnType<
        typeof AppState.addEventListener
      >);

    const { result } = renderHook(() => useHighContrast());

    await waitFor(() => expect(result.current).toBe(true));
  });
});

describe("useAnnounceOnMount", () => {
  test("announces the initial message once", () => {
    jest.replaceProperty(Platform, "OS", "android");
    const spoken = jest.spyOn(AccessibilityInfo, "announceForAccessibility");

    renderHook(() => useAnnounceOnMount("Answer ready"));

    expect(spoken).toHaveBeenCalledWith("Answer ready");
  });
});
