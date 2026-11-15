import { act, fireEvent, render, screen } from "@testing-library/react-native";

import * as a11y from "../src/lib/a11y";
import { ActionCard } from "../src/components/ActionCard";
import { AnswerBlock } from "../src/components/AnswerBlock";
import { ConfirmDialog } from "../src/components/ConfirmDialog";
import { HistoryRow } from "../src/components/HistoryRow";
import { MicButton } from "../src/components/MicButton";
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

  test("shows a labelled back action when supplied", () => {
    const onBack = jest.fn();
    render(<ScreenHeader title="History" onBack={onBack} />);
    fireEvent.press(screen.getByRole("button", { name: "Go back" }));
    expect(onBack).toHaveBeenCalled();
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

  test("renders a warning with an icon and readable text", () => {
    render(<StatusBanner tone="warning" message="Check this photo." />);
    expect(screen.getByText("Check this photo.")).toBeOnTheScreen();
    expect(
      screen.UNSAFE_getByProps({ accessibilityLiveRegion: "polite" }).props
        .accessibilityLiveRegion,
    ).toBe("polite");
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

describe("MicButton", () => {
  test.each([
    ["idle", "Tap to speak", false, false],
    ["listening", "Tap to stop", true, false],
    ["processing", "Processing", false, true],
  ] as const)(
    "exposes %s state accessibly",
    (state, label, selected, disabled) => {
      render(<MicButton state={state} onPress={jest.fn()} />);
      expect(screen.getByRole("button", { name: label })).toHaveProp(
        "accessibilityState",
        expect.objectContaining({ selected, disabled }),
      );
    },
  );
});

describe("AnswerBlock", () => {
  test("renders answer, playback label and verify note", () => {
    const onPlaybackPress = jest.fn();
    render(
      <AnswerBlock
        question="What does the sign say?"
        answer="The sign says Main Street."
        isPlaying={false}
        onPlaybackPress={onPlaybackPress}
      />,
    );
    fireEvent.press(screen.getByRole("button", { name: "Listen Again" }));
    expect(screen.getByText("The sign says Main Street.")).toBeOnTheScreen();
    expect(screen.getByText(/Answers can be wrong/)).toBeOnTheScreen();
    expect(onPlaybackPress).toHaveBeenCalled();
  });

  test("changes the playback label while speaking", () => {
    render(
      <AnswerBlock
        question="What is this?"
        answer="A cup."
        isPlaying
        onPlaybackPress={jest.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Stop speaking" })).toHaveProp(
      "accessibilityState",
      expect.objectContaining({ selected: true }),
    );
  });
});

describe("HistoryRow", () => {
  test("exposes the complete question, answer and date as one button", () => {
    const onPress = jest.fn();
    render(
      <HistoryRow
        question="What does this sign say?"
        answer="It says Main Street."
        createdAt={new Date().toISOString()}
        onPress={onPress}
      />,
    );
    const row = screen.getByRole("button");
    expect(row.props.accessibilityLabel).toContain(
      "Question: What does this sign say?",
    );
    expect(row.props.accessibilityLabel).toContain(
      "Answer: It says Main Street.",
    );
    expect(row.props.accessibilityLabel).toContain("Asked Today at");
    fireEvent.press(row);
    expect(onPress).toHaveBeenCalled();
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
  test("announces start, the delayed wait and completion", () => {
    jest.useFakeTimers();
    const spoken = jest.spyOn(a11y, "announce").mockImplementation(() => {});

    const { rerender } = render(
      <ProgressAnnouncer
        working
        startMessage="Uploading photo."
        stillWorkingMessage="Still uploading."
        finishMessage="Upload finished."
      />,
    );
    expect(spoken).toHaveBeenCalledWith("Uploading photo.", { queue: true });
    act(() => jest.advanceTimersByTime(8000));
    expect(spoken).toHaveBeenLastCalledWith("Still uploading.", {
      queue: true,
    });

    rerender(
      <ProgressAnnouncer
        working={false}
        startMessage="Uploading photo."
        stillWorkingMessage="Still uploading."
        finishMessage="Upload finished."
      />,
    );
    expect(spoken).toHaveBeenLastCalledWith("Upload finished.", {
      queue: true,
    });
    jest.useRealTimers();
  });
});
