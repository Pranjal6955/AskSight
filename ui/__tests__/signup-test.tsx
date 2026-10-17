import { Text } from "react-native";
import {
  fireEvent,
  renderRouter,
  screen,
  waitFor,
} from "expo-router/testing-library";

import SignupScreen from "../src/app/signup";
import { AuthProvider } from "../src/lib/auth";

function renderSignup() {
  return renderRouter(
    {
      signup: () => (
        <AuthProvider>
          <SignupScreen />
        </AuthProvider>
      ),
      login: () => <Text>Login</Text>,
      "(tabs)/home": () => <Text>Home</Text>,
    },
    { initialUrl: "/signup" },
  );
}

describe("Signup screen", () => {
  describe("rendering", () => {
    test("displays the brand logo and app name", async () => {
      await renderSignup();
      expect(screen.getByText("AskSight")).toBeOnTheScreen();
    });

    test("shows the heading and subtitle", async () => {
      await renderSignup();
      expect(screen.getByText("Create your account")).toBeOnTheScreen();
      expect(
        screen.getByText("Join AskSight and start exploring"),
      ).toBeOnTheScreen();
    });

    test("renders all three input fields with labels", async () => {
      await renderSignup();
      expect(screen.getByLabelText("Full name")).toBeOnTheScreen();
      expect(screen.getByLabelText("Email address")).toBeOnTheScreen();
      expect(screen.getByLabelText("Password")).toBeOnTheScreen();
    });

    test("shows the name hint text", async () => {
      await renderSignup();
      expect(screen.getByPlaceholderText("e.g. John Doe")).toBeOnTheScreen();
    });

    test("shows the email hint text", async () => {
      await renderSignup();
      expect(
        screen.getByPlaceholderText("you@example.com"),
      ).toBeOnTheScreen();
    });

    test("shows the password hint text", async () => {
      await renderSignup();
      expect(
        screen.getByPlaceholderText("Minimum 8 characters"),
      ).toBeOnTheScreen();
    });

    test("renders the Create account button", async () => {
      await renderSignup();
      expect(screen.getByText("Create account")).toBeOnTheScreen();
    });

    test("shows the Already have an account prompt", async () => {
      await renderSignup();
      expect(screen.getByText("Already have an account?")).toBeOnTheScreen();
    });

    test("renders the Sign in link", async () => {
      await renderSignup();
      expect(screen.getByText("Sign in")).toBeOnTheScreen();
    });

    test("shows the account benefits text", async () => {
      await renderSignup();
      expect(
        screen.getByText(
          "Your account helps keep your AskSight history in one place.",
        ),
      ).toBeOnTheScreen();
    });
  });

  describe("password visibility", () => {
    test("starts with password hidden", async () => {
      await renderSignup();
      expect(screen.getByLabelText("Show password")).toBeOnTheScreen();
      expect(screen.queryByLabelText("Hide password")).toBeNull();
    });

    test("toggles to Hide password on tap", async () => {
      await renderSignup();
      fireEvent.press(screen.getByLabelText("Show password"));
      expect(screen.getByLabelText("Hide password")).toBeOnTheScreen();
      expect(screen.queryByLabelText("Show password")).toBeNull();
    });
  });

  describe("navigation", () => {
    test("navigates to login on Sign in press", async () => {
      const router = await renderSignup();
      await fireEvent.press(screen.getByText("Sign in"));
      await waitFor(() => expect(router.getPathname()).toBe("/login"));
    });
  });

  describe("form validation", () => {
    test("rejects a password under 8 characters before calling the API", async () => {
      const api = require("../src/lib/api");
      const spy = jest.spyOn(api, "signup");

      await renderSignup();

      fireEvent.changeText(screen.getByLabelText("Full name"), "John Doe");
      fireEvent.changeText(
        screen.getByLabelText("Email address"),
        "john@example.com",
      );
      fireEvent.changeText(screen.getByLabelText("Password"), "short");
      await fireEvent.press(screen.getByText("Create account"));

      expect(
        await screen.findByText("Password must be at least 8 characters"),
      ).toBeOnTheScreen();
      expect(spy).not.toHaveBeenCalled();
    });

    test("accepts a password of exactly 8 characters", async () => {
      const api = require("../src/lib/api");
      jest.spyOn(api, "signup").mockResolvedValue({
        id: "1",
        name: "John Doe",
        email: "john@example.com",
        createdAt: "2026-01-01T00:00:00Z",
      });
      jest
        .spyOn(api, "login")
        .mockResolvedValue({ access_token: "t", token_type: "bearer" });
      jest.spyOn(api, "me").mockResolvedValue({
        id: "1",
        name: "John Doe",
        email: "john@example.com",
        createdAt: "2026-01-01T00:00:00Z",
      });

      await renderSignup();

      fireEvent.changeText(screen.getByLabelText("Full name"), "John Doe");
      fireEvent.changeText(
        screen.getByLabelText("Email address"),
        "john@example.com",
      );
      fireEvent.changeText(screen.getByLabelText("Password"), "12345678");
      await fireEvent.press(screen.getByText("Create account"));

      expect(
        screen.queryByText("Password must be at least 8 characters"),
      ).toBeNull();
    });
  });

  describe("signup flow", () => {
    test("creates the account and lands on the tabs", async () => {
      const api = require("../src/lib/api");
      jest.spyOn(api, "signup").mockResolvedValue({
        id: "1",
        name: "John Doe",
        email: "john@example.com",
        createdAt: "2026-01-01T00:00:00Z",
      });
      jest
        .spyOn(api, "login")
        .mockResolvedValue({ access_token: "t", token_type: "bearer" });
      jest.spyOn(api, "me").mockResolvedValue({
        id: "1",
        name: "John Doe",
        email: "john@example.com",
        createdAt: "2026-01-01T00:00:00Z",
      });

      const router = await renderSignup();

      fireEvent.changeText(screen.getByLabelText("Full name"), "John Doe");
      fireEvent.changeText(
        screen.getByLabelText("Email address"),
        "john@example.com",
      );
      fireEvent.changeText(screen.getByLabelText("Password"), "hunter2!");
      await fireEvent.press(screen.getByText("Create account"));

      expect(api.signup).toHaveBeenCalledWith({
        name: "John Doe",
        email: "john@example.com",
        password: "hunter2!",
      });
      await waitFor(() => expect(router.getPathname()).toBe("/home"));
    });

    test("trims whitespace from name and email before submitting", async () => {
      const api = require("../src/lib/api");
      const signupSpy = jest.spyOn(api, "signup").mockResolvedValue({
        id: "1",
        name: "John Doe",
        email: "john@example.com",
        createdAt: "2026-01-01T00:00:00Z",
      });
      jest
        .spyOn(api, "login")
        .mockResolvedValue({ access_token: "t", token_type: "bearer" });
      jest.spyOn(api, "me").mockResolvedValue({
        id: "1",
        name: "John Doe",
        email: "john@example.com",
        createdAt: "2026-01-01T00:00:00Z",
      });

      await renderSignup();

      fireEvent.changeText(
        screen.getByLabelText("Full name"),
        "  John Doe  ",
      );
      fireEvent.changeText(
        screen.getByLabelText("Email address"),
        "  john@example.com  ",
      );
      fireEvent.changeText(screen.getByLabelText("Password"), "hunter2!");
      await fireEvent.press(screen.getByText("Create account"));

      expect(signupSpy).toHaveBeenCalledWith({
        name: "John Doe",
        email: "john@example.com",
        password: "hunter2!",
      });
    });

    test("shows loading state while creating the account", async () => {
      const api = require("../src/lib/api");
      jest.spyOn(api, "signup").mockReturnValue(new Promise(() => {}));
      jest
        .spyOn(api, "login")
        .mockResolvedValue({ access_token: "t", token_type: "bearer" });
      jest.spyOn(api, "me").mockResolvedValue({
        id: "1",
        name: "John Doe",
        email: "john@example.com",
        createdAt: "2026-01-01T00:00:00Z",
      });

      await renderSignup();

      fireEvent.changeText(screen.getByLabelText("Full name"), "John Doe");
      fireEvent.changeText(
        screen.getByLabelText("Email address"),
        "john@example.com",
      );
      fireEvent.changeText(screen.getByLabelText("Password"), "hunter2!");
      fireEvent.press(screen.getByText("Create account"));

      expect(await screen.findByText("Signing in…")).toBeOnTheScreen();
    });

    test("surfaces the backend 409 when the email is already registered", async () => {
      const api = require("../src/lib/api");
      jest
        .spyOn(api, "signup")
        .mockRejectedValue(
          new Error("An Account with this email Already exists"),
        );

      await renderSignup();

      fireEvent.changeText(screen.getByLabelText("Full name"), "John Doe");
      fireEvent.changeText(
        screen.getByLabelText("Email address"),
        "john@example.com",
      );
      fireEvent.changeText(screen.getByLabelText("Password"), "hunter2!");
      await fireEvent.press(screen.getByText("Create account"));

      expect(
        await screen.findByText("An Account with this email Already exists"),
      ).toBeOnTheScreen();
    });

    test("shows a generic error for non-Error rejections", async () => {
      const api = require("../src/lib/api");
      jest.spyOn(api, "signup").mockRejectedValue("network failure");

      await renderSignup();

      fireEvent.changeText(screen.getByLabelText("Full name"), "John Doe");
      fireEvent.changeText(
        screen.getByLabelText("Email address"),
        "john@example.com",
      );
      fireEvent.changeText(screen.getByLabelText("Password"), "hunter2!");
      await fireEvent.press(screen.getByText("Create account"));

      expect(
        await screen.findByText(
          "Unable to create your account. Please try again.",
        ),
      ).toBeOnTheScreen();
    });
  });
});
