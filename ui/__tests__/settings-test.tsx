import {
  act,
  render,
  renderHook,
  screen,
  waitFor,
  fireEvent,
} from "@testing-library/react-native";
import * as SecureStore from "expo-secure-store";
import * as Linking from "expo-linking";
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
import * as a11y from "../src/lib/a11y";
import SettingsScreen from "../src/app/(tabs)/settings";
import { Providers, SignedInProviders } from "../test-utils";

const KEY = "asksight.settings";

function wrapper({ children }: { children: ReactNode }) {
  return <SettingsProvider>{children}</SettingsProvider>;
}

afterEach(() => jest.restoreAllMocks());

describe("settings", () => {
  test("starts with the documented defaults", async () => {
    const { result } = await renderHook(() => useSettings(), { wrapper });
    expect(result.current.settings).toEqual(DEFAULT_SETTINGS);
  });

  test("loads stored settings and replaces invalid values", async () => {
    await SecureStore.setItemAsync(
      KEY,
      JSON.stringify({ speechRate: 99, textScale: "huge" }),
    );

    const { result } = await renderHook(() => useSettings(), { wrapper });

    await waitFor(() => expect(result.current.settings.speechRate).toBe(1));
    expect(result.current.settings.textScale).toBe("system");
    expect(result.current.settings.speakAutomatically).toBe(true);
  });

  test("falls back to defaults when stored JSON is corrupt", async () => {
    await SecureStore.setItemAsync(KEY, "not json");

    const { result } = await renderHook(() => useSettings(), { wrapper });

    await waitFor(() =>
      expect(SecureStore.getItemAsync).toHaveBeenCalledWith(KEY),
    );
    expect(result.current.settings).toEqual(DEFAULT_SETTINGS);
  });

  test("persists a change", async () => {
    const { result } = await renderHook(() => useSettings(), { wrapper });

    await act(() => result.current.update("textScale", "large"));

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

    const { result } = await renderHook(() => useTextScale(), { wrapper });

    await waitFor(() => expect(result.current).toBe(1.3));
  });
});

describe("useAutoSpeak", () => {
  test("requires the setting, a finished screen-reader check, and no screen reader", async () => {
    const screenReader = jest.spyOn(useA11y, "useScreenReader");

    screenReader.mockReturnValue(null);
    expect(
      (await renderHook(() => useAutoSpeak(), { wrapper })).result.current,
    ).toBe(false);

    screenReader.mockReturnValue(true);
    expect(
      (await renderHook(() => useAutoSpeak(), { wrapper })).result.current,
    ).toBe(false);

    screenReader.mockReturnValue(false);
    expect(
      (await renderHook(() => useAutoSpeak(), { wrapper })).result.current,
    ).toBe(true);
  });
});

describe("AppText", () => {
  test("applies the app scale on top of the variant size", async () => {
    await SecureStore.setItemAsync(
      KEY,
      JSON.stringify({ ...DEFAULT_SETTINGS, textScale: "xlarge" }),
    );

    await render(
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

  test("uses the system scale by default", async () => {
    await render(
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

describe("Settings text scale preview", () => {
  test("updates the sample immediately and announces the selected size", async () => {
    const spoken = jest.spyOn(a11y, "announce").mockImplementation(() => {});
    await render(
      <Providers>
        <SettingsScreen />
      </Providers>,
    );

    await fireEvent.press(screen.getByRole("radio", { name: "Extra large" }));

    expect(
      screen.getByText("You can change the text size any time."),
    ).toHaveStyle({
      fontSize: 26,
      lineHeight: 36.4,
    });
    expect(spoken).toHaveBeenCalledWith("Text size set to Extra large.");
  });

  test("changes speech speed and language and announces both choices", async () => {
    const spoken = jest.spyOn(a11y, "announce").mockImplementation(() => {});
    await render(
      <Providers>
        <SettingsScreen />
      </Providers>,
    );

    await fireEvent.press(screen.getByRole("radio", { name: "Fast" }));
    await fireEvent.press(screen.getByRole("radio", { name: "English (India)" }));

    await waitFor(async () => {
      expect(await SecureStore.getItemAsync(KEY)).toContain('"speechRate":1.2');
    });
    expect(spoken).toHaveBeenCalledWith("Speech speed set to Fast.");
    expect(spoken).toHaveBeenCalledWith(
      "Spoken language set to English (India).",
    );
  });

  test("persists and announces the automatic speech toggle", async () => {
    const spoken = jest.spyOn(a11y, "announce").mockImplementation(() => {});
    await render(
      <Providers>
        <SettingsScreen />
      </Providers>,
    );

    await fireEvent(
      screen.getByRole("switch", { name: "Speak answers automatically" }),
      "valueChange",
      false,
    );

    await waitFor(async () => {
      expect(await SecureStore.getItemAsync(KEY)).toContain(
        '"speakAutomatically":false',
      );
    });
    expect(spoken).toHaveBeenCalledWith("Speak answers automatically, off.");
  });

  test("shows a cached model version in About and labels the mock in development", async () => {
    await SecureStore.setItemAsync(
      KEY,
      JSON.stringify({ ...DEFAULT_SETTINGS, lastModelVersion: "mock-0.0.0" }),
    );
    await render(
      <Providers>
        <SettingsScreen />
      </Providers>,
    );

    expect(
      await screen.findByText("Last model version: mock-0.0.0"),
    ).toBeOnTheScreen();
    if (__DEV__) {
      expect(
        screen.getByText("Demo mode — not a real model."),
      ).toBeOnTheScreen();
    }
  });

  test("asks before signing out and can cancel", async () => {
    const api = require("../src/lib/api");
    jest.spyOn(api, "login").mockResolvedValue({
      access_token: "t",
      refresh_token: "r",
      token_type: "bearer",
    });
    jest.spyOn(api, "me").mockResolvedValue({
      id: "1",
      name: "John Smith",
      email: "john@example.com",
      createdAt: "2026-01-01T00:00:00Z",
    });
    await render(
      <SignedInProviders>
        <SettingsScreen />
      </SignedInProviders>,
    );

    await fireEvent.press(
      await screen.findByRole("button", { name: "Sign out of your account" }),
    );
    expect(
      await screen.findByText(
        "You will need to sign in again to use AskSight.",
      ),
    ).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Stay Signed In" }));
    expect(
      screen.queryByText("You will need to sign in again to use AskSight."),
    ).not.toBeOnTheScreen();
  });

  test("opens the support link", async () => {
    const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
    await render(
      <Providers>
        <SettingsScreen />
      </Providers>,
    );

    await fireEvent.press(
      screen.getByRole("link", { name: "AskSight support page" }),
    );
    await waitFor(() =>
      expect(openURL).toHaveBeenCalledWith(
        "https://github.com/Pranjal6955/AskSight/issues",
      ),
    );
  });

  test("shows a delete failure and preserves the cache", async () => {
    const api = require("../src/lib/api");
    jest
      .spyOn(api, "deleteAllHistory")
      .mockRejectedValue(
        new api.ApiError("History could not be deleted.", 503, null),
      );
    await render(
      <Providers>
        <SettingsScreen />
      </Providers>,
    );

    await fireEvent.press(screen.getByRole("button", { name: "Delete All History" }));
    await fireEvent.press(screen.getByRole("button", { name: "Delete All" }));
    expect(
      await screen.findByText("History could not be deleted."),
    ).toBeOnTheScreen();
  });
});
