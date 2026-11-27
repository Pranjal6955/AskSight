import { fireEvent, render } from "@testing-library/react-native";

import { ErrorBanner } from "@/components/ErrorBanner";
import { FormField } from "@/components/FormField";
import { PrimaryButton } from "@/components/PrimaryButton";

describe("ErrorBanner", () => {
  it("renders nothing without a message", async () => {
    const { queryByRole } = await render(<ErrorBanner message={null} />);
    expect(queryByRole("alert")).toBeNull();
  });

  it("announces the message", async () => {
    const { getByRole, getByText } = await render(
      <ErrorBanner message="Something went wrong" />,
    );
    expect(getByRole("alert")).toBeTruthy();
    expect(getByText("Something went wrong")).toBeTruthy();
  });
});

describe("PrimaryButton", () => {
  it("calls onPress when pressed", async () => {
    const onPress = jest.fn();
    const { getByRole } = await render(
      <PrimaryButton label="Sign in" onPress={onPress} />,
    );

    await fireEvent.press(getByRole("button", { name: "Sign in" }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("cannot be pressed while loading", async () => {
    const onPress = jest.fn();
    const { getByRole } = await render(
      <PrimaryButton
        label="Sign in"
        loading
        onPress={onPress}
        loadingLabel="Signing in…"
      />,
    );

    const button = getByRole("button", { name: "Signing in…" });
    expect(button.props.accessibilityState).toMatchObject({
      busy: true,
      disabled: true,
    });
    await fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
  });
});

describe("FormField", () => {
  it("toggles password visibility", async () => {
    const { getByLabelText } = await render(
      <FormField
        label="Password"
        placeholder="Enter password"
        icon="lock-closed"
        secureTextEntry
      />,
    );

    const input = getByLabelText("Password");
    expect(input.props.secureTextEntry).toBe(true);

    await fireEvent.press(getByLabelText("Show password"));
    expect(input.props.secureTextEntry).toBe(false);

    await fireEvent.press(getByLabelText("Hide password"));
    expect(input.props.secureTextEntry).toBe(true);
  });
});
