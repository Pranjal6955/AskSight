import { fireEvent, render, screen } from "@testing-library/react-native";

import * as a11y from "../src/lib/a11y";
import { ActionCard } from "../src/components/ActionCard";
import { ConfirmDialog } from "../src/components/ConfirmDialog";
import { ProgressAnnouncer } from "../src/components/ProgressAnnouncer";
import { ScreenHeader } from "../src/components/ScreenHeader";
import { SecondaryButton } from "../src/components/SecondaryButton";
import { StatusBanner } from "../src/components/StatusBanner";

afterEach(() => jest.restoreAllMocks());

describe("ScreenHeader", () => {
  test("renders the title as a heading with a subtitle", () => {
    render(<ScreenHeader title="History" subtitle="Your past questions" />);

    expect(screen.getByRole("header")).toHaveTextContent("History");
    expect(screen.getByText("Your past questions")).toBeOnTheScreen();
  });
});

describe("ActionCard", () => {
  test("exposes one descriptive button and fires on press", () => {
    const onPress = jest.fn();
    render(
      <ActionCard
        title="Take a photo"
        description="Ask about what is around you"
        icon="camera-outline"
        onPress={onPress}
      />,
    );

    fireEvent.press(
      screen.getByRole("button", {
        name: "Take a photo. Ask about what is around you",
      }),
    );

    expect(onPress).toHaveBeenCalled();
  });

  test("is disabled when asked", () => {
    render(
      <ActionCard
        title="Take a photo"
        icon="camera-outline"
        onPress={jest.fn()}
        disabled
      />,
    );

    expect(screen.getByRole("button")).toBeDisabled();
  });
});

describe("StatusBanner", () => {
  test("announces errors assertively with an alert role", () => {
    render(<StatusBanner tone="error" message="Couldn't save that." />);

    const alert = screen.getByRole("alert");
    expect(screen.getByText("Couldn't save that.")).toBeOnTheScreen();
    expect(alert).toHaveProp("accessibilityLiveRegion", "assertive");
  });

  test("announces successes politely", () => {
    render(<StatusBanner tone="success" message="Saved." />);
    expect(screen.getByText("Saved.")).toBeOnTheScreen();
    expect(
      screen.UNSAFE_getByProps({ accessibilityLiveRegion: "polite" }).props
        .accessibilityLiveRegion,
    ).toBe("polite");
  });
});

describe("SecondaryButton", () => {
  test("reports loading and blocks presses", () => {
    const onPress = jest.fn();
    render(<SecondaryButton label="Cancel" loading onPress={onPress} />);

    const button = screen.getByRole("button", { name: "Please wait…" });
    expect(button).toBeDisabled();
    fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
  });

  test("fires when enabled", () => {
    const onPress = jest.fn();
    render(<SecondaryButton label="Cancel" onPress={onPress} />);
    fireEvent.press(screen.getByRole("button", { name: "Cancel" }));
    expect(onPress).toHaveBeenCalled();
  });
});

describe("ConfirmDialog", () => {
  test("calls confirm and cancel from the visible dialog", () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    render(
      <ConfirmDialog
        visible
        title="Delete all history?"
        message="This cannot be undone."
        confirmLabel="Delete"
        destructive
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    expect(screen.getByText("This cannot be undone.")).toBeOnTheScreen();
    fireEvent.press(screen.getByRole("button", { name: "Delete" }));
    fireEvent.press(screen.getByRole("button", { name: "Cancel" }));

    expect(onConfirm).toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalled();
  });
});

describe("ProgressAnnouncer", () => {
  test("speaks each new progress message", () => {
    const spoken = jest.spyOn(a11y, "announce").mockImplementation(() => {});

    const { rerender } = render(
      <ProgressAnnouncer message="Uploading photo" />,
    );
    expect(spoken).toHaveBeenCalledWith("Uploading photo", { queue: true });

    rerender(<ProgressAnnouncer message="Reading the photo" />);
    expect(spoken).toHaveBeenLastCalledWith("Reading the photo", {
      queue: true,
    });
  });
});
