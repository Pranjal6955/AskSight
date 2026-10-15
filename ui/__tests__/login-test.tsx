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
      // Landing route so the post-login redirect resolves inside the harness.
      "(tabs)/home": () => <Text>Home</Text>,
    },
    { initialUrl: "/login" },
  );
}

test("renders the login screen from the design", async () => {
  await renderLogin();

  expect(screen.getByText("AskSight")).toBeOnTheScreen();
  expect(screen.getByText("See the world through AI")).toBeOnTheScreen();
  expect(screen.getByText("Welcome back")).toBeOnTheScreen();
  expect(screen.getByText("Sign in to continue")).toBeOnTheScreen();
  expect(screen.getByText("Forgot password?")).toBeOnTheScreen();
  expect(screen.getByText("Continue with Google")).toBeOnTheScreen();
  expect(screen.getByText("Sign up")).toBeOnTheScreen();
});

test("labels both input fields", async () => {
  await renderLogin();
  expect(screen.getByLabelText("Email address")).toBeOnTheScreen();
  expect(screen.getByLabelText("Password")).toBeOnTheScreen();
});

test("offers the password visibility toggle on the password field only", async () => {
  await renderLogin();
  expect(screen.getByLabelText("Show password")).toBeOnTheScreen();
  expect(screen.queryByLabelText("Hide password")).toBeNull();
});

test("toggles password visibility on tap", async () => {
  await renderLogin();
  fireEvent.press(screen.getByLabelText("Show password"));
  expect(screen.getByLabelText("Hide password")).toBeOnTheScreen();
});

test("signs in through the API and redirects to the tabs", async () => {
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

  fireEvent.changeText(screen.getByLabelText("Email address"), "john@example.com");
  fireEvent.changeText(screen.getByLabelText("Password"), "hunter2!");
  await fireEvent.press(screen.getByText("Sign in"));

  expect(api.login).toHaveBeenCalledWith({
    email: "john@example.com",
    password: "hunter2!",
  });
  await waitFor(() => expect(router.getPathname()).toBe("/home"));
});

test("surfaces the backend error message on a failed sign in", async () => {
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