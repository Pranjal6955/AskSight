import { renderRouter, screen, waitFor } from "expo-router/testing-library";

import TabsLayout from "../src/app/(tabs)/_layout";
import HistoryScreen from "../src/app/(tabs)/history";
import HomeScreen from "../src/app/(tabs)/home";
import SettingsScreen from "../src/app/(tabs)/settings";
import RootLayout from "../src/app/_layout";
import Index from "../src/app/index";
import LoginScreen from "../src/app/login";
import SignupScreen from "../src/app/signup";
import * as api from "../src/lib/api";
import { setAccessToken, setRefreshToken } from "../src/lib/session";
import { TEST_USER } from "../test-utils";

const routes = {
  _layout: RootLayout,
  index: Index,
  login: LoginScreen,
  signup: SignupScreen,
  capture: () => null,
  "photo-preview": () => null,
  ask: () => null,
  "(tabs)/_layout": TabsLayout,
  "(tabs)/home": HomeScreen,
  "(tabs)/history": HistoryScreen,
  "(tabs)/settings": SettingsScreen,
};

afterEach(() => {
  jest.restoreAllMocks();
  setAccessToken(null);
  api.setSessionExpiredHandler(null);
});

describe("route guard", () => {
  test("sends a signed-out user to Login", async () => {
    renderRouter(routes, { initialUrl: "/home" });

    await waitFor(() =>
      expect(screen.getByText("Welcome back to AskSight")).toBeOnTheScreen(),
    );
  });

  test("sends a signed-in user to Home", async () => {
    await setRefreshToken("r1");
    jest.spyOn(api, "refresh").mockResolvedValue({
      access_token: "a2",
      refresh_token: "r2",
      token_type: "bearer",
    });
    jest.spyOn(api, "me").mockResolvedValue(TEST_USER);

    renderRouter(routes, { initialUrl: "/login" });

    await waitFor(() => expect(screen.getByText("John!")).toBeOnTheScreen());
  });
});
