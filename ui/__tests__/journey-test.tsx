import {
  fireEvent,
  renderRouter,
  screen,
  waitFor,
} from "expo-router/testing-library";
import * as SecureStore from "expo-secure-store";

import * as api from "../src/lib/api";
import TabsLayout from "../src/app/(tabs)/_layout";
import HistoryScreen from "../src/app/(tabs)/history";
import HomeScreen from "../src/app/(tabs)/home";
import SettingsScreen from "../src/app/(tabs)/settings";
import AnswerScreen from "../src/app/answer";
import AskScreen from "../src/app/ask";
import ConsentScreen from "../src/app/consent";
import Index from "../src/app/index";
import LoginScreen from "../src/app/login";
import PhotoPreviewScreen from "../src/app/photo-preview";
import SignupScreen from "../src/app/signup";
import TranscriptScreen from "../src/app/transcript";
import HistoryDetailScreen from "../src/app/history/[id]";
import RootLayout from "../src/app/_layout";
import { clearRefreshToken } from "../src/lib/session";

const mockStopRecording = jest.fn();
const mockPlay = jest.fn();
const mockStop = jest.fn();
const mockWrite = jest.fn();
let mockRecordingActive = true;

jest.mock("expo-image-picker", () => ({
  requestMediaLibraryPermissionsAsync: jest.fn().mockResolvedValue({
    granted: true,
  }),
  launchImageLibraryAsync: jest.fn().mockResolvedValue({
    canceled: false,
    assets: [
      {
        uri: "file:///picked.jpg",
        fileName: "picked.jpg",
        mimeType: "image/jpeg",
        width: 32,
        height: 24,
        fileSize: 100,
      },
    ],
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
    durationMillis: 1000,
    error: "",
  }),
}));

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
    uri = "file:///cache/answer.mp3";
    exists = true;
    create = jest.fn();
    write = mockWrite;
    delete = jest.fn();
    constructor() {}
  },
}));

const routes = {
  _layout: RootLayout,
  index: Index,
  login: LoginScreen,
  signup: SignupScreen,
  consent: ConsentScreen,
  capture: () => null,
  "photo-preview": PhotoPreviewScreen,
  ask: AskScreen,
  transcript: TranscriptScreen,
  answer: AnswerScreen,
  "history/[id]": HistoryDetailScreen,
  "(tabs)/_layout": TabsLayout,
  "(tabs)/home": HomeScreen,
  "(tabs)/history": HistoryScreen,
  "(tabs)/settings": SettingsScreen,
};

beforeEach(async () => {
  await clearRefreshToken();
  await SecureStore.setItemAsync(
    "asksight.settings",
    JSON.stringify({
      speakAutomatically: false,
      speechRate: 1,
      textScale: "system",
      speechLanguage: "en-IN",
      consentGiven: true,
      lastModelVersion: null,
    }),
  );
  mockRecordingActive = true;
  mockStopRecording.mockReset().mockImplementation(async () => {
    mockRecordingActive = false;
    return {
      uri: "file:///question.m4a",
      name: "question.m4a",
      type: "audio/mp4",
    };
  });
  mockPlay.mockReset();
  mockStop.mockReset();
  mockWrite.mockReset().mockResolvedValue(undefined);
});

afterEach(() => jest.restoreAllMocks());

test("signs in, picks a photo, asks by voice, replays the answer, and opens history", async () => {
  const user = {
    id: "user-1",
    name: "Jamie Reader",
    email: "jamie@example.com",
    createdAt: "2026-11-15T00:00:00Z",
  };
  const image = {
    id: "image-1",
    mime_type: "image/jpeg",
    size_bytes: 100,
    width: 32,
    height: 24,
    created_at: "2026-11-15T00:00:00Z",
  };
  const item = {
    id: "entry-1",
    question: "What does the label say?",
    answer: "It says tea.",
    image_id: image.id,
    image_url: "/images/image-1",
    model_version: "mock-0.0.0",
    created_at: "2026-11-15T00:00:00Z",
  };
  jest.spyOn(api, "login").mockResolvedValue({
    access_token: "access",
    refresh_token: "refresh",
    token_type: "bearer",
  });
  jest.spyOn(api, "me").mockResolvedValue(user);
  const uploadImage = jest.spyOn(api, "uploadImage").mockResolvedValue(image);
  const transcribe = jest.spyOn(api, "transcribe").mockResolvedValue({
    transcript: item.question,
    language: "en-IN",
  });
  const ask = jest.spyOn(api, "ask").mockResolvedValue({
    entry_id: item.id,
    answer: item.answer,
    model_version: item.model_version,
    created_at: item.created_at,
  });
  const synthesize = jest.spyOn(api, "synthesize").mockResolvedValue({
    bytes: new Uint8Array([1, 2, 3]).buffer,
    mimeType: "audio/mpeg",
  });
  jest.spyOn(api, "listHistory").mockResolvedValue({
    items: [item],
    next_cursor: null,
    has_more: false,
  });

  const app = await renderRouter(routes, { initialUrl: "/login" });
  fireEvent.changeText(screen.getByLabelText("Email address"), user.email);
  fireEvent.changeText(screen.getByLabelText("Password"), "secure-password");
  fireEvent.press(screen.getByRole("button", { name: "Sign in" }));
  await waitFor(() =>
    expect(screen.getByRole("header", { name: "Jamie!" })).toBeOnTheScreen(),
  );

  fireEvent.press(screen.getByRole("button", { name: "Choose from Library" }));
  expect(await screen.findByLabelText("Your photo")).toBeOnTheScreen();
  fireEvent.press(screen.getByRole("button", { name: "Use Photo" }));
  await waitFor(() =>
    expect(screen.getByText("Ask about this photo")).toBeOnTheScreen(),
  );
  expect(uploadImage).toHaveBeenCalledTimes(1);

  fireEvent.press(screen.getByRole("button", { name: "Tap to stop" }));
  expect(await screen.findByLabelText("Edit your question")).toHaveDisplayValue(
    item.question,
  );
  expect(transcribe).toHaveBeenCalledTimes(1);
  fireEvent.press(screen.getByRole("button", { name: "Ask This Question" }));
  expect(await screen.findByText(item.answer)).toBeOnTheScreen();
  expect(ask).toHaveBeenCalledWith(
    image.id,
    item.question,
    expect.any(AbortSignal),
  );

  fireEvent.press(screen.getByRole("button", { name: "Listen Again" }));
  await waitFor(() =>
    expect(mockPlay).toHaveBeenCalledWith("file:///cache/answer.mp3", 1),
  );
  expect(synthesize).toHaveBeenCalledWith(
    item.answer,
    "en-IN",
    undefined,
    expect.any(AbortSignal),
  );

  fireEvent.press(screen.getByRole("button", { name: "New Photo" }));
  fireEvent.press(screen.getByText("History"));
  expect(await screen.findByText(item.question)).toBeOnTheScreen();
  expect(app.getPathname()).toBe("/history");
});
