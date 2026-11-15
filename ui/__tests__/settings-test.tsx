import {
  act,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react-native";
import * as SecureStore from "expo-secure-store";
import type { ReactNode } from "react";

import { AppText } from "../src/components/AppText";
import {
  DEFAULT_SETTINGS,
  SettingsProvider,
  useAutoSpeak,
  useSettings,
  useTextScale,
} from "../src/lib/settings";
import * as useA11y from "../src/lib/useA11y";

const KEY = "asksight.settings";

function wrapper({ children }: { children: ReactNode }) {
  return <SettingsProvider>{children}</SettingsProvider>;
}

afterEach(() => jest.restoreAllMocks());

describe("settings", () => {
  test("starts with the documented defaults", () => {
    const { result } = renderHook(() => useSettings(), { wrapper });
    expect(result.current.settings).toEqual(DEFAULT_SETTINGS);
  });

  test("loads stored settings and clamps invalid values", async () => {
    await SecureStore.setItemAsync(
      KEY,
      JSON.stringify({ speechRate: 99, textScale: "huge" }),
    );

    const { result } = renderHook(() => useSettings(), { wrapper });

    await waitFor(() => expect(result.current.settings.speechRate).toBe(2));
    expect(result.current.settings.textScale).toBe("system");
    expect(result.current.settings.speakAutomatically).toBe(true);
  });

  test("falls back to defaults when stored JSON is corrupt", async () => {
    await SecureStore.setItemAsync(KEY, "not json");

    const { result } = renderHook(() => useSettings(), { wrapper });

    await waitFor(() =>
      expect(SecureStore.getItemAsync).toHaveBeenCalledWith(KEY),
    );
    expect(result.current.settings).toEqual(DEFAULT_SETTINGS);
  });

  test("persists a change", async () => {
    const { result } = renderHook(() => useSettings(), { wrapper });

    act(() => result.current.update("textScale", "large"));

    expect(result.current.settings.textScale).toBe("large");
    await waitFor(async () =>
      expect(await SecureStore.getItemAsync(KEY)).toContain(
        '"textScale":"large"',
      ),
    );
  });
});

describe("useTextScale", () => {
  test("maps each stored scale to its multiplier", async () => {
    await SecureStore.setItemAsync(
      KEY,
      JSON.stringify({ ...DEFAULT_SETTINGS, textScale: "xlarge" }),
    );

    const { result } = renderHook(() => useTextScale(), { wrapper });

    await waitFor(() => expect(result.current).toBe(1.3));
  });
});

describe("useAutoSpeak", () => {
  test("requires the setting, a finished screen-reader check, and no screen reader", () => {
    const screenReader = jest.spyOn(useA11y, "useScreenReader");

    screenReader.mockReturnValue(null);
    expect(renderHook(() => useAutoSpeak(), { wrapper }).result.current).toBe(
      false,
    );

    screenReader.mockReturnValue(true);
    expect(renderHook(() => useAutoSpeak(), { wrapper }).result.current).toBe(
      false,
    );

    screenReader.mockReturnValue(false);
    expect(renderHook(() => useAutoSpeak(), { wrapper }).result.current).toBe(
      true,
    );
  });
});

describe("AppText", () => {
  test("applies the app scale on top of the variant size", async () => {
    await SecureStore.setItemAsync(
      KEY,
      JSON.stringify({ ...DEFAULT_SETTINGS, textScale: "xlarge" }),
    );

    render(
      <SettingsProvider>
        <AppText variant="body" testID="body">
          Hello
        </AppText>
      </SettingsProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("body")).toHaveStyle({
        fontSize: 20.8,
        lineHeight: 31.2,
      }),
    );
  });

  test("uses the system scale by default", () => {
    render(
      <SettingsProvider>
        <AppText variant="hero" testID="hero">
          Hello
        </AppText>
      </SettingsProvider>,
    );

    expect(screen.getByTestId("hero")).toHaveStyle({
      fontSize: 36,
      lineHeight: 40,
    });
  });
});
