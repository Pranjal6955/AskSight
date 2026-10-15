import { useEffect } from "react";
import {
  fireEvent,
  renderRouter,
  screen,
  waitFor,
} from "expo-router/testing-library";

import TabsLayout from "../src/app/(tabs)/_layout";
import HistoryScreen from "../src/app/(tabs)/history";
import HomeScreen from "../src/app/(tabs)/home";
import SettingsScreen from "../src/app/(tabs)/settings";
import { AuthProvider, useAuth } from "../src/lib/auth";

const USER = {
  id: "1",
  name: "John Smith",
  email: "john@example.com",
  createdAt: "2026-01-01T00:00:00Z",
};

function mockSignedIn() {
  const api = require("../src/lib/api");
  jest
    .spyOn(api, "login")
    .mockResolvedValue({ access_token: "t", token_type: "bearer" });
  jest.spyOn(api, "me").mockResolvedValue(USER);
}

// Mirrors the real tree: AuthProvider sits above the tabs navigator.
function SignInOnMount() {
  const { signIn } = useAuth();
  useEffect(() => {
    signIn({ email: USER.email, password: "hunter2!" });
  }, [signIn]);
  return null;
}

function renderTabs({ signedIn = false } = {}) {
  return renderRouter(
    {
      "(tabs)/_layout": () => (
        <AuthProvider>
          {signedIn ? <SignInOnMount /> : null}
          <TabsLayout />
        </AuthProvider>
      ),
      "(tabs)/home": HomeScreen,
      "(tabs)/history": HistoryScreen,
      "(tabs)/settings": SettingsScreen,
    },
    { initialUrl: "/home" },
  );
}

test("greets the signed-in user by first name", async () => {
  mockSignedIn();
  await renderTabs({ signedIn: true });

  await waitFor(() =>
    expect(screen.getByText("Hello, John!")).toBeOnTheScreen(),
  );
  expect(screen.getByText("How can I help you today?")).toBeOnTheScreen();
  expect(screen.getByText("JS")).toBeOnTheScreen();
});

test("renders the three ask actions from the design", async () => {
  await renderTabs();

  expect(screen.getByText("Ask with Camera")).toBeOnTheScreen();
  expect(screen.getByText("Ask with Voice")).toBeOnTheScreen();
  expect(screen.getByText("Ask with Text")).toBeOnTheScreen();
  expect(
    screen.getByText("Take a photo and get an AI description"),
  ).toBeOnTheScreen();
  expect(screen.getByText("Speak your question")).toBeOnTheScreen();
  expect(screen.getByText("Type your question")).toBeOnTheScreen();
});

test("shows the Home, History and Settings tabs", async () => {
  await renderTabs();

  expect(screen.getAllByText("Home").length).toBeGreaterThan(0);
  expect(screen.getByText("History")).toBeOnTheScreen();
  expect(screen.getByText("Settings")).toBeOnTheScreen();
});

test("switches between tabs", async () => {
  const router = await renderTabs();

  await fireEvent.press(screen.getByText("History"));
  expect(router.getPathname()).toBe("/history");

  await fireEvent.press(screen.getByText("Settings"));
  expect(router.getPathname()).toBe("/settings");
});

test("History is a placeholder until the backend stores queries", async () => {
  await renderTabs();
  await fireEvent.press(screen.getByText("History"));
  expect(
    await screen.findByText("Your past questions will appear here."),
  ).toBeOnTheScreen();
});
