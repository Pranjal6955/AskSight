import {
  fireEvent,
  renderRouter,
  screen,
  waitFor,
} from "expo-router/testing-library";

import * as api from "../src/lib/api";
import HistoryScreen from "../src/app/(tabs)/history";
import HistoryDetailScreen from "../src/app/history/[id]";
import SettingsScreen from "../src/app/(tabs)/settings";
import { clearCachedHistory } from "../src/lib/historyCache";
import { Providers } from "../test-utils";

const mockPlay = jest.fn();
const mockStop = jest.fn();
const mockFileWrite = jest.fn();
const mockFileDelete = jest.fn();

jest.mock("../src/lib/useSpeech", () => ({
  useSpeech: () => ({
    play: mockPlay,
    stop: mockStop,
    isPlaying: false,
    didJustFinish: false,
  }),
}));

jest.mock("expo-file-system", () => ({
  Paths: { cache: { uri: "file:///cache" } },
  File: class {
    uri = "file:///cache/history.png";
    exists = true;
    create = jest.fn();
    write = mockFileWrite;
    delete = mockFileDelete;
    constructor() {}
  },
}));

const first = {
  id: "entry-1",
  question: "What does this sign say?",
  answer: "It says Exit.",
  image_id: "image-1",
  image_url: "/images/image-1",
  model_version: "model-1",
  created_at: "2026-11-15T10:00:00Z",
};
const second = {
  ...first,
  id: "entry-2",
  question: "What colour is the sign?",
};

function renderHistory(initialUrl = "/history") {
  return renderRouter(
    {
      history: () => (
        <Providers>
          <HistoryScreen />
        </Providers>
      ),
      "history/[id]": () => (
        <Providers>
          <HistoryDetailScreen />
        </Providers>
      ),
      settings: () => (
        <Providers>
          <SettingsScreen />
        </Providers>
      ),
    },
    { initialUrl },
  );
}

beforeEach(() => {
  clearCachedHistory();
  mockFileWrite.mockReset().mockResolvedValue(undefined);
  mockFileDelete.mockReset();
  mockPlay.mockReset();
  mockStop.mockReset();
});

afterEach(() => jest.restoreAllMocks());

describe("history list and detail", () => {
  test("loads the first page and explicitly loads the next cursor page", async () => {
    jest
      .spyOn(api, "listHistory")
      .mockResolvedValueOnce({
        items: [first],
        next_cursor: "cursor-1",
        has_more: true,
      })
      .mockResolvedValueOnce({
        items: [second],
        next_cursor: null,
        has_more: false,
      });
    await renderHistory();

    expect(
      await screen.findByText("What does this sign say?"),
    ).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Load More" }));

    expect(
      await screen.findByText("What colour is the sign?"),
    ).toBeOnTheScreen();
    expect(api.listHistory).toHaveBeenNthCalledWith(1, { limit: 20 });
    expect(api.listHistory).toHaveBeenNthCalledWith(2, {
      cursor: "cursor-1",
      limit: 20,
    });
  });

  test("shows the empty state and refreshes explicitly", async () => {
    const list = jest.spyOn(api, "listHistory").mockResolvedValue({
      items: [],
      next_cursor: null,
      has_more: false,
    });
    await renderHistory();

    expect(await screen.findByText("No questions yet")).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
    expect(
      screen.getByRole("button", { name: "Ask your first question" }),
    ).toBeOnTheScreen();
  });

  test("shows backend errors with a retry action", async () => {
    jest
      .spyOn(api, "listHistory")
      .mockRejectedValueOnce(
        new api.ApiError("The service is unavailable.", 503, null),
      )
      .mockResolvedValueOnce({ items: [], next_cursor: null, has_more: false });
    await renderHistory();

    expect(
      await screen.findByText("The service is unavailable."),
    ).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Try Again" }));
    expect(await screen.findByText("No questions yet")).toBeOnTheScreen();
  });

  test("confirms cascade deletion and removes the deleted row", async () => {
    jest
      .spyOn(api, "listHistory")
      .mockResolvedValueOnce({
        items: [first],
        next_cursor: null,
        has_more: false,
      })
      .mockResolvedValueOnce({ items: [], next_cursor: null, has_more: false });
    jest.spyOn(api, "getHistoryEntry").mockResolvedValue(first);
    jest.spyOn(api, "getImage").mockResolvedValue({
      bytes: new Uint8Array([1, 2]).buffer,
      mimeType: "image/png",
    });
    const remove = jest
      .spyOn(api, "deleteHistoryEntry")
      .mockResolvedValue(undefined);
    const app = await renderHistory();

    await fireEvent.press(
      await screen.findByRole("button", {
        name: /Question: What does this sign say/,
      }),
    );
    await screen.findByRole("button", {
      name: "Delete this question and its answer",
    });
    await fireEvent.press(
      screen.getByRole("button", {
        name: "Delete this question and its answer",
      }),
    );
    expect(
      screen.getByText(/photo is also deleted if it was the last question/),
    ).toBeOnTheScreen();
    await fireEvent.press(
      screen.getByRole("button", { name: "Delete Question" }),
    );

    await waitFor(() => expect(remove).toHaveBeenCalledWith("entry-1"));
    expect(await screen.findByText("No questions yet")).toBeOnTheScreen();
    expect(app.getPathname()).toBe("/history");
  });

  test("hides photo retry when the image is gone and shows the backend sentence", async () => {
    jest.spyOn(api, "getHistoryEntry").mockResolvedValue(first);
    jest
      .spyOn(api, "getImage")
      .mockRejectedValue(
        new api.ApiError(
          "This image is no longer available. Please upload it again.",
          404,
          null,
        ),
      );
    await renderHistory("/history/entry-1");

    expect(
      await screen.findByText(
        "This image is no longer available. Please upload it again.",
      ),
    ).toBeOnTheScreen();
    expect(
      screen.queryByRole("button", { name: "Ask About This Photo Again" }),
    ).not.toBeOnTheScreen();
    expect(
      screen.queryByRole("button", { name: "Retry Photo" }),
    ).not.toBeOnTheScreen();
  });
});

describe("delete all history", () => {
  test("names photos in the confirmation and clears cache after success", async () => {
    const remove = jest
      .spyOn(api, "deleteAllHistory")
      .mockResolvedValue(undefined);
    await renderHistory("/settings");

    await fireEvent.press(
      screen.getByRole("button", { name: "Delete All History" }),
    );
    expect(
      screen.getByText(
        "This deletes every question, answer, and photo in your history. It cannot be undone.",
      ),
    ).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Delete All" }));

    await waitFor(() => expect(remove).toHaveBeenCalled());
    expect(
      await screen.findByText("All questions, answers, and photos deleted."),
    ).toBeOnTheScreen();
  });
});
