import { useEffect } from "react";
import { Text } from "react-native";
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
      login: () => <Text>Login</Text>,
    },
    { initialUrl: "/home" },
  );
}

describe("Tabs layout", () => {
  describe("tab bar", () => {
    test("shows the Home, History and Settings tabs", async () => {
      await renderTabs();
      expect(screen.getByText("Home")).toBeOnTheScreen();
      expect(screen.getByText("History")).toBeOnTheScreen();
      expect(screen.getByText("Settings")).toBeOnTheScreen();
    });

    test("switches to History tab on press", async () => {
      const router = await renderTabs();
      await fireEvent.press(screen.getByText("History"));
      expect(router.getPathname()).toBe("/history");
    });

    test("switches to Settings tab on press", async () => {
      const router = await renderTabs();
      await fireEvent.press(screen.getByText("Settings"));
      expect(router.getPathname()).toBe("/settings");
    });

    test("switches back to Home tab on press", async () => {
      const router = await renderTabs();
      await fireEvent.press(screen.getByText("History"));
      await fireEvent.press(screen.getByText("Home"));
      expect(router.getPathname()).toBe("/home");
    });
  });
});

describe("Home screen", () => {
  describe("signed in", () => {
    test("greets the signed-in user by first name", async () => {
      mockSignedIn();
      await renderTabs({ signedIn: true });
      await waitFor(() =>
        expect(screen.getByText("John!")).toBeOnTheScreen(),
      );
    });

    test("shows the AskSight brand in the home header", async () => {
      mockSignedIn();
      await renderTabs({ signedIn: true });
      expect(screen.getByLabelText("AskSight")).toBeOnTheScreen();
    });
  });

  describe("ask with camera", () => {
    test("renders the Take a Photo card", async () => {
      await renderTabs();
      expect(screen.getByText("Take a Photo")).toBeOnTheScreen();
      expect(
        screen.getByText(
          "Capture your surroundings and get an AI description.",
        ),
      ).toBeOnTheScreen();
    });

    test("shows the accessibility label for the camera card", async () => {
      await renderTabs();
      expect(
        screen.getByLabelText(
          "Ask with Camera. Take a photo and get an AI description of your surroundings",
        ),
      ).toBeOnTheScreen();
    });
  });

  describe("recent history", () => {
    test("shows the Recent activity heading", async () => {
      await renderTabs();
      expect(screen.getByText("Recent activity")).toBeOnTheScreen();
    });

    test("shows the empty state", async () => {
      await renderTabs();
      expect(screen.getByText("No questions yet")).toBeOnTheScreen();
    });

    test("shows the empty state description", async () => {
      await renderTabs();
      expect(
        screen.getByText("Your past questions will appear here."),
      ).toBeOnTheScreen();
    });

    test("navigates to the History tab on See all press", async () => {
      const router = await renderTabs();
      await fireEvent.press(screen.getByText("See all"));
      await waitFor(() => expect(router.getPathname()).toBe("/history"));
    });

    test("opens Settings from the header gear button", async () => {
      const router = await renderTabs();
      await fireEvent.press(screen.getByLabelText("Open settings"));
      await waitFor(() => expect(router.getPathname()).toBe("/settings"));
    });
  });
});

describe("History screen", () => {
  test("shows the History heading", async () => {
    await renderTabs();
    await fireEvent.press(screen.getByText("History"));
    expect(
      await screen.findByText("Return to questions you have asked."),
    ).toBeOnTheScreen();
  });

  test("shows the empty state", async () => {
    await renderTabs();
    await fireEvent.press(screen.getByText("History"));
    expect(await screen.findByText("No questions yet")).toBeOnTheScreen();
  });

  test("shows the empty state description", async () => {
    await renderTabs();
    await fireEvent.press(screen.getByText("History"));
    expect(
      await screen.findByText("Your past questions will appear here."),
    ).toBeOnTheScreen();
  });

  test("shows the coming soon note", async () => {
    await renderTabs();
    await fireEvent.press(screen.getByText("History"));
    expect(
      await screen.findByText(
        "Your question history will be available when saved sessions are supported.",
      ),
    ).toBeOnTheScreen();
  });

  test("renders the Ask your first question button", async () => {
    await renderTabs();
    await fireEvent.press(screen.getByText("History"));
    expect(
      await screen.findByText("Ask your first question"),
    ).toBeOnTheScreen();
  });

  test("navigates back to Home on Ask your first question press", async () => {
    const router = await renderTabs();
    await fireEvent.press(screen.getByText("History"));
    await fireEvent.press(await screen.findByText("Ask your first question"));
    await waitFor(() => expect(router.getPathname()).toBe("/home"));
  });
});

describe("Settings screen", () => {
  describe("signed out", () => {
    test("shows the Settings heading", async () => {
      await renderTabs();
      await fireEvent.press(screen.getByText("Settings"));
      expect(
        await screen.findByText("Manage your AskSight account."),
      ).toBeOnTheScreen();
    });

    test("shows the sign-in prompt when signed out", async () => {
      await renderTabs();
      await fireEvent.press(screen.getByText("Settings"));
      expect(
        await screen.findByText("Sign in to manage your account."),
      ).toBeOnTheScreen();
    });

    test("disables the Sign out button when signed out", async () => {
      await renderTabs();
      await fireEvent.press(screen.getByText("Settings"));
      const signOut = await screen.findByLabelText("Sign out of your account");
      expect(signOut).toBeOnTheScreen();
      expect(signOut.props.accessibilityState.disabled).toBe(true);
    });
  });

  describe("signed in", () => {
    test("shows the user name and email", async () => {
      mockSignedIn();
      await renderTabs({ signedIn: true });
      await fireEvent.press(screen.getByText("Settings"));
      await waitFor(() =>
        expect(screen.getByText("John Smith")).toBeOnTheScreen(),
      );
      expect(screen.getByText("john@example.com")).toBeOnTheScreen();
    });

    test("shows the user initials avatar", async () => {
      mockSignedIn();
      await renderTabs({ signedIn: true });
      await fireEvent.press(screen.getByText("Settings"));
      await waitFor(() => expect(screen.getByText("JS")).toBeOnTheScreen());
    });

    test("enables the Sign out button when signed in", async () => {
      mockSignedIn();
      await renderTabs({ signedIn: true });
      await fireEvent.press(screen.getByText("Settings"));
      const signOut = await screen.findByLabelText("Sign out of your account");
      expect(signOut.props.accessibilityState.disabled).toBe(false);
    });

    test("signs out and redirects to login on Sign out press", async () => {
      mockSignedIn();
      const router = await renderTabs({ signedIn: true });
      await fireEvent.press(screen.getByText("Settings"));
      await waitFor(() =>
        expect(screen.getByText("John Smith")).toBeOnTheScreen(),
      );
      await fireEvent.press(screen.getByLabelText("Sign out of your account"));
      await waitFor(() => expect(router.getPathname()).toBe("/login"));
    });
  });

  describe("about section", () => {
    test("shows the About AskSight heading", async () => {
      await renderTabs();
      await fireEvent.press(screen.getByText("Settings"));
      expect(await screen.findByText("About AskSight")).toBeOnTheScreen();
    });

    test("shows the app mission description", async () => {
      await renderTabs();
      await fireEvent.press(screen.getByText("Settings"));
      expect(
        await screen.findByText(
          "AskSight helps blind and low-vision users understand their surroundings through image descriptions and questions.",
        ),
      ).toBeOnTheScreen();
    });
  });
});
