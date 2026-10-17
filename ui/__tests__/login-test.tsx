import { Text } from "react-native";
import {
  fireEvent,
  renderRouter,
  screen,
  waitFor,
} from "expo-router/testing-library";

import LoginScreen from "../src/app/login";
import { AuthProvider } from "../src/lib/auth";

function renderLogin() {
  return renderRouter(
    {
      login: () => (
        <AuthProvider>
          <LoginScreen />
        </AuthProvider>
      ),
      signup: () => <Text>Signup</Text>,
      "(tabs)/home": () => <Text>Home</Text>,
    },
    { initialUrl: "/login" },
  );
}

describe("Login screen", () => {
  describe("rendering", () => {
    test("displays the brand logo and app name", async () => {
      await renderLogin();
      expect(screen.getByText("AskSight")).toBeOnTheScreen();
    });

    test("shows the welcome heading and subtitle", async () => {
      await renderLogin();
      expect(screen.getByText("Welcome back")).toBeOnTheScreen();
      expect(screen.getByText("Sign in to continue")).toBeOnTheScreen();
    });

    test("renders both input fields with labels", async () => {
      await renderLogin();
      expect(screen.getByLabelText("Email address")).toBeOnTheScreen();
      expect(screen.getByLabelText("Password")).toBeOnTheScreen();
    });

    test("shows the email hint text", async () => {
      await renderLogin();
      expect(screen.getByPlaceholderText("you@example.com")).toBeOnTheScreen();
    });

    test("shows the password hint text", async () => {
      await renderLogin();
      expect(
        screen.getByPlaceholderText("Enter your password"),
      ).toBeOnTheScreen();
    });

    test("renders the Sign in button", async () => {
      await renderLogin();
      expect(screen.getByText("Sign in")).toBeOnTheScreen();
    });

    test("shows the New to AskSight prompt", async () => {
      await renderLogin();
      expect(screen.getByText("New to AskSight?")).toBeOnTheScreen();
    });

    test("renders the Create account link", async () => {
      await renderLogin();
      expect(screen.getByText("Create account")).toBeOnTheScreen();
    });
  });

  describe("password visibility", () => {
    test("starts with password hidden", async () => {
      await renderLogin();
      expect(screen.getByLabelText("Show password")).toBeOnTheScreen();
      expect(screen.queryByLabelText("Hide password")).toBeNull();
    });

    test("toggles to Hide password on tap", async () => {
      await renderLogin();
      fireEvent.press(screen.getByLabelText("Show password"));
      expect(screen.getByLabelText("Hide password")).toBeOnTheScreen();
      expect(screen.queryByLabelText("Show password")).toBeNull();
    });

    test("toggles back to Show password on second tap", async () => {
      await renderLogin();
      fireEvent.press(screen.getByLabelText("Show password"));
      fireEvent.press(screen.getByLabelText("Hide password"));
      expect(screen.getByLabelText("Show password")).toBeOnTheScreen();
    });
  });

  describe("navigation", () => {
    test("navigates to signup on Create account press", async () => {
      const router = await renderLogin();
      await fireEvent.press(screen.getByText("Create account"));
      await waitFor(() => expect(router.getPathname()).toBe("/signup"));
    });
  });

  describe("sign in flow", () => {
    test("calls the API with trimmed email and redirects on success", async () => {
      const api = require("../src/lib/api");
      jest
        .spyOn(api, "login")
        .mockResolvedValue({ access_token: "t", token_type: "bearer" });
      jest.spyOn(api, "me").mockResolvedValue({
        id: "1",
        name: "John Smith",
        email: "john@example.com",
        createdAt: "2026-01-01T00:00:00Z",
      });

      const router = await renderLogin();

      fireEvent.changeText(
        screen.getByLabelText("Email address"),
        "  john@example.com  ",
      );
      fireEvent.changeText(screen.getByLabelText("Password"), "hunter2!");
      await fireEvent.press(screen.getByText("Sign in"));

      expect(api.login).toHaveBeenCalledWith({
        email: "john@example.com",
        password: "hunter2!",
      });
      await waitFor(() => expect(router.getPathname()).toBe("/home"));
    });

    test("shows loading state while signing in", async () => {
      const api = require("../src/lib/api");
      jest.spyOn(api, "login").mockReturnValue(new Promise(() => {}));
      jest.spyOn(api, "me").mockResolvedValue({
        id: "1",
        name: "John Smith",
        email: "john@example.com",
        createdAt: "2026-01-01T00:00:00Z",
      });

      await renderLogin();

      fireEvent.changeText(screen.getByLabelText("Email address"), "john@example.com");
      fireEvent.changeText(screen.getByLabelText("Password"), "hunter2!");
      fireEvent.press(screen.getByText("Sign in"));

      expect(await screen.findByText("Signing in…")).toBeOnTheScreen();
    });

    test("displays the backend error message on failed sign in", async () => {
      const api = require("../src/lib/api");
      jest
        .spyOn(api, "login")
        .mockRejectedValue(new Error("Invalid email or Password"));

      await renderLogin();
      await fireEvent.press(screen.getByText("Sign in"));

      expect(
        await screen.findByText("Invalid email or Password"),
      ).toBeOnTheScreen();
    });

    test("clears the previous error when retrying", async () => {
      const api = require("../src/lib/api");
      const loginSpy = jest
        .spyOn(api, "login")
        .mockRejectedValueOnce(new Error("Invalid email or Password"))
        .mockResolvedValueOnce({ access_token: "t", token_type: "bearer" });
      jest.spyOn(api, "me").mockResolvedValue({
        id: "1",
        name: "John Smith",
        email: "john@example.com",
        createdAt: "2026-01-01T00:00:00Z",
      });

      await renderLogin();

      fireEvent.changeText(screen.getByLabelText("Email address"), "john@example.com");
      fireEvent.changeText(screen.getByLabelText("Password"), "hunter2!");
      await fireEvent.press(screen.getByText("Sign in"));

      expect(
        await screen.findByText("Invalid email or Password"),
      ).toBeOnTheScreen();

      await fireEvent.press(screen.getByText("Sign in"));
      await waitFor(() =>
        expect(screen.queryByText("Invalid email or Password")).toBeNull(),
      );
    });

    test("shows a generic error for non-Error rejections", async () => {
      const api = require("../src/lib/api");
      jest.spyOn(api, "login").mockRejectedValue("network failure");

      await renderLogin();
      await fireEvent.press(screen.getByText("Sign in"));

      expect(
        await screen.findByText("Unable to sign in. Please try again."),
      ).toBeOnTheScreen();
    });
  });
});
