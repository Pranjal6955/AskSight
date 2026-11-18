import {
  fireEvent,
  renderRouter,
  screen,
  waitFor,
} from "expo-router/testing-library";
import * as SecureStore from "expo-secure-store";

import * as api from "../src/lib/api";
import * as a11y from "../src/lib/a11y";
import AnswerScreen from "../src/app/answer";
import { SettingsProvider } from "../src/lib/settings";

const mockPlaySpeech = jest.fn();
const mockStopSpeech = jest.fn();
const mockFileWrite = jest.fn();
const mockFileDelete = jest.fn();
let mockAutoSpeak = false;

jest.mock("../src/lib/settings", () => {
  const actual = jest.requireActual("../src/lib/settings");
  return { ...actual, useAutoSpeak: () => mockAutoSpeak };
});

jest.mock("../src/lib/useSpeech", () => ({
  useSpeech: () => ({
    play: mockPlaySpeech,
    stop: mockStopSpeech,
    isPlaying: false,
    didJustFinish: false,
  }),
}));

jest.mock("expo-file-system", () => ({
  Paths: { cache: { uri: "file:///cache" } },
  File: class {
    uri = "file:///cache/answer.mp3";
    exists = true;
    create = jest.fn();
    write = mockFileWrite;
    delete = mockFileDelete;
    constructor() {}
  },
}));

function renderAnswer(url: string) {
  return renderRouter(
    {
      answer: () => (
        <SettingsProvider>
          <AnswerScreen />
        </SettingsProvider>
      ),
    },
    { initialUrl: url },
  );
}

afterEach(() => {
  mockAutoSpeak = false;
  jest.restoreAllMocks();
});

describe("answer playback", () => {
  test("shows the answer and writes TTS bytes to cache before playback", async () => {
    const bytes = new Uint8Array([1, 2, 3]).buffer;
    jest
      .spyOn(api, "synthesize")
      .mockResolvedValue({ bytes, mimeType: "audio/mpeg" });
    const app = await renderAnswer(
      "/answer?image_id=img&question=Read%20this&answer=It%20says%20Exit.",
    );

    expect(screen.getByText("It says Exit.")).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Listen Again" }));

    await waitFor(() =>
      expect(mockPlaySpeech).toHaveBeenCalledWith(
        "file:///cache/answer.mp3",
        1,
      ),
    );
    expect(mockFileWrite).toHaveBeenCalledWith(new Uint8Array(bytes));
    expect(app.getPathname()).toBe("/answer");
    await app.unmount();
    expect(mockStopSpeech).toHaveBeenCalled();
    expect(mockFileDelete).toHaveBeenCalled();
  });

  test("automatically speaks only when the setting allows it", async () => {
    mockAutoSpeak = true;
    const announce = jest.spyOn(a11y, "announce");
    jest.spyOn(api, "synthesize").mockResolvedValue({
      bytes: new Uint8Array([4, 5]).buffer,
      mimeType: "audio/mpeg",
    });

    await renderAnswer("/answer?question=What%20is%20this&answer=A%20lamp.");

    await waitFor(() =>
      expect(mockPlaySpeech).toHaveBeenCalledWith(
        "file:///cache/answer.mp3",
        1,
      ),
    );
    expect(announce).toHaveBeenCalledWith("Answer ready.");
  });

  test("shows a persistence warning but keeps the answer", async () => {
    await renderAnswer(
      "/answer?question=What%20is%20this&answer=A%20red%20car.&history_error=The%20answer%20could%20not%20be%20saved%20to%20history.",
    );

    expect(
      screen.getByText("The answer could not be saved to history."),
    ).toBeOnTheScreen();
    expect(screen.getByText("A red car.")).toBeOnTheScreen();
  });

  test("persists the latest model version for the About screen", async () => {
    await renderAnswer(
      "/answer?question=What%20is%20this&answer=A%20lamp.&model_version=mock-0.0.0",
    );

    await waitFor(async () => {
      expect(await SecureStore.getItemAsync("asksight.settings")).toContain(
        '"lastModelVersion":"mock-0.0.0"',
      );
    });
  });

  test("keeps the answer visible when TTS is unavailable", async () => {
    jest
      .spyOn(api, "synthesize")
      .mockRejectedValue(
        new api.ApiError(
          "Speech is not available right now. Please try again later.",
          503,
          null,
        ),
      );
    await renderAnswer(
      "/answer?image_id=img&question=What%20is%20this&answer=A%20wooden%20chair.",
    );

    await fireEvent.press(screen.getByRole("button", { name: "Listen Again" }));

    expect(
      await screen.findByText(
        "Speech is not available right now. Please try again later.",
      ),
    ).toBeOnTheScreen();
    expect(screen.getByText("A wooden chair.")).toBeOnTheScreen();
    expect(mockPlaySpeech).not.toHaveBeenCalled();
  });

  test("uses the follow-up question as the primary action for clarification", async () => {
    await renderAnswer(
      "/answer?image_id=img&question=What%20is%20it&answer=Sorry%2C%20I%20could%20not%20find%20a%20clear%20answer.%20Could%20you%20ask%20again%3F",
    );

    expect(
      screen.getByRole("button", { name: "Ask Another Question" }),
    ).toBeOnTheScreen();
    expect(
      screen.getByRole("button", { name: "Listen Again" }),
    ).toBeOnTheScreen();
  });
});
