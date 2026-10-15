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
      "(tabs)/home": () => <Text>Home</Text>,
    },
    { initialUrl: "/signup" },
  );
}

test("renders the signup screen from the design", async () => {
  await renderSignup();

  expect(screen.getByText("Create your account")).toBeOnTheScreen();
  expect(
    screen.getByText("Join AskSight and start exploring"),
  ).toBeOnTheScreen();
  expect(screen.getByLabelText("Go back")).toBeOnTheScreen();
  expect(screen.getByText("Continue with Google")).toBeOnTheScreen();
  expect(screen.getByText("Sign in")).toBeOnTheScreen();
});

test("labels all three fields and shows the password rules", async () => {
  await renderSignup();

  expect(screen.getByPlaceholderText("Full name")).toBeOnTheScreen();
  expect(screen.getByPlaceholderText("Email address")).toBeOnTheScreen();
  expect(screen.getByPlaceholderText("Password")).toBeOnTheScreen();
  expect(screen.getByText("e.g. John Doe")).toBeOnTheScreen();
  expect(screen.getByText("Minimum 8 characters")).toBeOnTheScreen();
});

test("hides the field hints once the user types", async () => {
  await renderSignup();
  fireEvent.changeText(screen.getByPlaceholderText("Full name"), "John");
  expect(screen.queryByText("e.g. John Doe")).toBeNull();
});

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

  fireEvent.changeText(screen.getByPlaceholderText("Full name"), "John Doe");
  fireEvent.changeText(
    screen.getByPlaceholderText("Email address"),
    "john@example.com",
  );
  fireEvent.changeText(screen.getByPlaceholderText("Password"), "hunter2!");
  await fireEvent.press(screen.getByText("Create account"));

  expect(api.signup).toHaveBeenCalledWith({
    name: "John Doe",
    email: "john@example.com",
    password: "hunter2!",
  });
  await waitFor(() => expect(router.getPathname()).toBe("/home"));
});

test("rejects a password under the backend minimum before calling the API", async () => {
  const api = require("../src/lib/api");
  const spy = jest.spyOn(api, "signup");

  await renderSignup();

  fireEvent.changeText(screen.getByPlaceholderText("Full name"), "John Doe");
  fireEvent.changeText(
    screen.getByPlaceholderText("Email address"),
    "john@example.com",
  );
  fireEvent.changeText(screen.getByPlaceholderText("Password"), "short");
  await fireEvent.press(screen.getByText("Create account"));

  expect(
    await screen.findByText("Password must be at least 8 characters"),
  ).toBeOnTheScreen();
  expect(spy).not.toHaveBeenCalled();
});

test("surfaces the backend 409 when the email is already registered", async () => {
  const api = require("../src/lib/api");
  jest
    .spyOn(api, "signup")
    .mockRejectedValue(new Error("An Account with this email Already exists"));

  await renderSignup();

  fireEvent.changeText(screen.getByPlaceholderText("Full name"), "John Doe");
  fireEvent.changeText(
    screen.getByPlaceholderText("Email address"),
    "john@example.com",
  );
  fireEvent.changeText(screen.getByPlaceholderText("Password"), "hunter2!");
  await fireEvent.press(screen.getByText("Create account"));

  expect(
    await screen.findByText("An Account with this email Already exists"),
  ).toBeOnTheScreen();
});
