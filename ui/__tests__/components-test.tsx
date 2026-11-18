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
  test("renders the title as a heading with a subtitle", async () => {
    await render(
      <ScreenHeader title="History" subtitle="Your past questions" />,
    );

    expect(screen.getByRole("header")).toHaveTextContent("History");
    expect(screen.getByText("Your past questions")).toBeOnTheScreen();
  });

  test("shows a labelled back action when supplied", async () => {
    const onBack = jest.fn();
    await render(<ScreenHeader title="History" onBack={onBack} />);
    await fireEvent.press(screen.getByRole("button", { name: "Go back" }));
    expect(onBack).toHaveBeenCalled();
  });
});

describe("ActionCard", () => {
  test("exposes one descriptive button and fires on press", async () => {
    const onPress = jest.fn();
    await render(
      <ActionCard
        title="Take a photo"
        description="Ask about what is around you"
        icon="camera-outline"
        onPress={onPress}
      />,
    );

    await fireEvent.press(
      screen.getByRole("button", {
        name: "Take a photo. Ask about what is around you",
      }),
    );

    expect(onPress).toHaveBeenCalled();
  });

  test("is disabled when asked", async () => {
    await render(
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
  test("announces errors assertively with an alert role", async () => {
    await render(<StatusBanner tone="error" message="Couldn't save that." />);

    const alert = screen.getByRole("alert");
    expect(screen.getByText("Couldn't save that.")).toBeOnTheScreen();
    expect(alert).toHaveProp("accessibilityLiveRegion", "assertive");
  });

  test("renders a warning with an icon and readable text", async () => {
    await render(<StatusBanner tone="warning" message="Check this photo." />);
    expect(screen.getByText("Check this photo.")).toBeOnTheScreen();
    expect(
      screen.container.queryAll(
        (element) => element.props.accessibilityLiveRegion === "polite",
      ),
    ).toHaveLength(1);
  });

  test("announces successes politely", async () => {
    await render(<StatusBanner tone="success" message="Saved." />);
    expect(screen.getByText("Saved.")).toBeOnTheScreen();
    expect(
      screen.container.queryAll(
        (element) => element.props.accessibilityLiveRegion === "polite",
      ),
    ).toHaveLength(1);
  });
});

describe("MicButton", () => {
  test.each([
    ["idle", "Tap to speak", false, false],
    ["listening", "Tap to stop", true, false],
    ["processing", "Processing", false, true],
  ] as const)(
    "exposes %s state accessibly",
    async (state, label, selected, disabled) => {
      await render(<MicButton state={state} onPress={jest.fn()} />);
      expect(screen.getByRole("button", { name: label })).toHaveProp(
        "accessibilityState",
        expect.objectContaining({ selected, disabled }),
      );
    },
  );
});

describe("AnswerBlock", () => {
  test("renders answer, playback label and verify note", async () => {
    const onPlaybackPress = jest.fn();
    await render(
      <AnswerBlock
        question="What does the sign say?"
        answer="The sign says Main Street."
        isPlaying={false}
        onPlaybackPress={onPlaybackPress}
      />,
    );
    await fireEvent.press(screen.getByRole("button", { name: "Listen Again" }));
    expect(screen.getByText("The sign says Main Street.")).toBeOnTheScreen();
    expect(screen.getByText(/Answers can be wrong/)).toBeOnTheScreen();
    expect(onPlaybackPress).toHaveBeenCalled();
  });

  test("changes the playback label while speaking", async () => {
    await render(
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
  test("exposes the complete question, answer and date as one button", async () => {
    const onPress = jest.fn();
    await render(
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
    await fireEvent.press(row);
    expect(onPress).toHaveBeenCalled();
  });
});

describe("SecondaryButton", () => {
  test("reports loading and blocks presses", async () => {
    const onPress = jest.fn();
    await render(<SecondaryButton label="Cancel" loading onPress={onPress} />);

    const button = screen.getByRole("button", { name: "Please wait…" });
    expect(button).toBeDisabled();
    await fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
  });

  test("fires when enabled", async () => {
    const onPress = jest.fn();
    await render(<SecondaryButton label="Cancel" onPress={onPress} />);
    await fireEvent.press(screen.getByRole("button", { name: "Cancel" }));
    expect(onPress).toHaveBeenCalled();
  });
});

describe("ConfirmDialog", () => {
  test("calls confirm and cancel from the visible dialog", async () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    await render(
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
    await fireEvent.press(screen.getByRole("button", { name: "Delete" }));
    await fireEvent.press(screen.getByRole("button", { name: "Cancel" }));

    expect(onConfirm).toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalled();
  });
});

describe("ProgressAnnouncer", () => {
  test("announces start, the delayed wait and completion", async () => {
    jest.useFakeTimers();
    const spoken = jest.spyOn(a11y, "announce").mockImplementation(() => {});

    const { rerender } = await render(
      <ProgressAnnouncer
        working
        startMessage="Uploading photo."
        stillWorkingMessage="Still uploading."
        finishMessage="Upload finished."
      />,
    );
    expect(spoken).toHaveBeenCalledWith("Uploading photo.", { queue: true });
    await act(() => jest.advanceTimersByTime(8000));
    expect(spoken).toHaveBeenLastCalledWith("Still uploading.", {
      queue: true,
    });

    await rerender(
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
