import {
  fireEvent,
  renderRouter,
  screen,
  waitFor,
} from "expo-router/testing-library";

import * as api from "../src/lib/api";
import AskScreen from "../src/app/ask";
import TranscriptScreen from "../src/app/transcript";
import AnswerScreen from "../src/app/answer";
import { Providers } from "../test-utils";

const mockStopRecording = jest.fn();
let mockRecordingActive = true;

jest.mock("../src/lib/useSpeech", () => ({
  useSpeech: () => ({
    play: jest.fn(),
    stop: jest.fn(),
    isPlaying: false,
    didJustFinish: false,
  }),
}));

jest.mock("../src/lib/useRecorder", () => ({
  useRecorder: () => ({
    permissionGranted: true,
    permissionChecked: true,
    requestPermission: jest.fn(),
    startRecording: jest.fn(),
    stopRecording: mockStopRecording,
    cancelRecording: jest.fn(),
    isRecording: mockRecordingActive,
    durationMillis: 1200,
    error: "",
  }),
}));

function renderFlow(initialUrl: string) {
  return renderRouter(
    {
      ask: () => (
        <Providers>
          <AskScreen />
        </Providers>
      ),
      transcript: () => (
        <Providers>
          <TranscriptScreen />
        </Providers>
      ),
      answer: () => (
        <Providers>
          <AnswerScreen />
        </Providers>
      ),
    },
    { initialUrl },
  );
}

afterEach(() => jest.restoreAllMocks());

describe("ask flow", () => {
  test("records, transcribes, reviews, and submits the confirmed question", async () => {
    const audioFile = {
      uri: "file:///question.m4a",
      name: "asksight-question.m4a",
      type: "audio/mp4",
    };
    mockRecordingActive = true;
    mockStopRecording.mockImplementation(async () => {
      mockRecordingActive = false;
      return audioFile;
    });
    const transcribe = jest.spyOn(api, "transcribe").mockResolvedValue({
      transcript: "What does the label say?",
      language: "en-IN",
    });
    const ask = jest.spyOn(api, "ask").mockResolvedValue({
      entry_id: "entry-1",
      answer: "It says rice.",
      model_version: "test",
      created_at: "2026-11-15T00:00:00Z",
    });
    const router = await renderFlow(
      "/ask?image_id=image-1&photo_uri=file%3A%2F%2F%2Fphoto.jpg",
    );

    fireEvent.press(screen.getByRole("button", { name: "Tap to stop" }));
    await waitFor(() => expect(router.getPathname()).toBe("/transcript"));
    expect(transcribe).toHaveBeenCalledWith(audioFile);
    expect(screen.getByLabelText("Edit your question")).toHaveDisplayValue(
      "What does the label say?",
    );

    fireEvent.press(screen.getByRole("button", { name: "Ask This Question" }));
    await waitFor(() => expect(router.getPathname()).toBe("/answer"));
    expect(ask).toHaveBeenCalledWith(
      "image-1",
      "What does the label say?",
      expect.any(AbortSignal),
    );
    expect(screen.getByText("It says rice.")).toBeOnTheScreen();
  });

  test("keeps the typed path available when transcription fails", async () => {
    mockRecordingActive = true;
    const audioFile = {
      uri: "file:///bad.webm",
      name: "bad.webm",
      type: "audio/webm",
    };
    mockStopRecording.mockImplementation(async () => {
      mockRecordingActive = false;
      return audioFile;
    });
    jest
      .spyOn(api, "transcribe")
      .mockRejectedValue(
        new api.ApiError(
          "Speech is not available right now. Please try again later.",
          503,
          null,
        ),
      );
    const ask = jest.spyOn(api, "ask").mockResolvedValue({
      entry_id: "entry-2",
      answer: "A blue mug.",
      model_version: "test",
      created_at: "2026-11-15T00:00:00Z",
    });
    const router = await renderFlow("/ask?image_id=image-2");

    fireEvent.press(screen.getByRole("button", { name: "Tap to stop" }));
    expect(
      await screen.findByText(
        "Speech is not available right now. Please try again later.",
      ),
    ).toBeOnTheScreen();
    fireEvent.changeText(
      screen.getByLabelText("Your question"),
      "What is in the photo?",
    );
    fireEvent.press(screen.getByRole("button", { name: "Ask" }));

    await waitFor(() => expect(router.getPathname()).toBe("/answer"));
    expect(ask).toHaveBeenCalledWith(
      "image-2",
      "What is in the photo?",
      expect.any(AbortSignal),
    );
  });

  test("shows ask failures and leaves the transcript available for retry", async () => {
    const ask = jest
      .spyOn(api, "ask")
      .mockRejectedValue(
        new api.ApiError(
          "The model is unavailable right now. Please try again later.",
          503,
          null,
        ),
      );
    await renderFlow("/transcript?image_id=image-3&transcript=Read%20this");

    fireEvent.press(screen.getByRole("button", { name: "Ask This Question" }));

    expect(
      await screen.findByText(
        "The model is unavailable right now. Please try again later.",
      ),
    ).toBeOnTheScreen();
    expect(ask).toHaveBeenCalledWith(
      "image-3",
      "Read this",
      expect.any(AbortSignal),
    );
    expect(screen.getByLabelText("Edit your question")).toHaveDisplayValue(
      "Read this",
    );
  });

  test("cancels the pending ask without showing a failed-answer message", async () => {
    mockRecordingActive = false;
    let signal: AbortSignal | undefined;
    jest
      .spyOn(api, "ask")
      .mockImplementation((_imageId, _question, requestSignal) => {
        signal = requestSignal;
        return new Promise((_resolve, reject) => {
          requestSignal?.addEventListener("abort", () => {
            reject(Object.assign(new Error("Aborted"), { name: "AbortError" }));
          });
        });
      });
    await renderFlow("/ask?image_id=image-4");
    fireEvent.changeText(
      screen.getByLabelText("Your question"),
      "What is this?",
    );
    fireEvent.press(screen.getByRole("button", { name: "Ask" }));

    expect(await screen.findByText("Looking at your photo…")).toBeOnTheScreen();
    fireEvent.press(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(signal?.aborted).toBe(true));
    expect(screen.queryByText(/couldn't answer/i)).not.toBeOnTheScreen();
    expect(screen.getByLabelText("Your question")).toHaveDisplayValue(
      "What is this?",
    );
  });
});
