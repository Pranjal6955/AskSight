import { fireEvent, render } from "@testing-library/react-native";
import { router } from "expo-router";

import LoginScreen from "@/app/login";
import { useAuth } from "@/lib/auth";

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), replace: jest.fn() },
}));

jest.mock("@/lib/auth", () => ({ useAuth: jest.fn() }));

const signIn = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  (useAuth as jest.Mock).mockReturnValue({ signIn });
});

describe("LoginScreen", () => {
  it("shows a validation error and does not call the API for empty fields", async () => {
    const view = await render(<LoginScreen />);

    await fireEvent.press(view.getByRole("button", { name: "Sign in" }));

    expect(signIn).not.toHaveBeenCalled();
    expect(
      view.getByText("Enter your email and password to continue."),
    ).toBeTruthy();
  });

  it("trims the email and navigates home after signing in", async () => {
    signIn.mockResolvedValue(undefined);
    const view = await render(<LoginScreen />);

    await fireEvent.changeText(
      view.getByLabelText("Email"),
      "  ada@example.com  ",
    );
    await fireEvent.changeText(view.getByLabelText("Password"), "password123");
    await fireEvent.press(view.getByRole("button", { name: "Sign in" }));

    expect(signIn).toHaveBeenCalledWith({
      email: "ada@example.com",
      password: "password123",
    });
    expect(router.replace).toHaveBeenCalledWith("/(tabs)/home");
  });

  it("shows the error returned by sign-in", async () => {
    signIn.mockRejectedValue(new Error("Invalid email or password."));
    const view = await render(<LoginScreen />);

    await fireEvent.changeText(view.getByLabelText("Email"), "ada@example.com");
    await fireEvent.changeText(
      view.getByLabelText("Password"),
      "wrong-password",
    );
    await fireEvent.press(view.getByRole("button", { name: "Sign in" }));

    expect(view.getByText("Invalid email or password.")).toBeTruthy();
    expect(router.replace).not.toHaveBeenCalled();
  });
});
