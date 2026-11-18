import {
  fireEvent,
  renderRouter,
  screen,
  waitFor,
} from "expo-router/testing-library";

import * as ImagePicker from "expo-image-picker";
import * as api from "../src/lib/api";
import CaptureScreen from "../src/app/capture";
import PhotoPreviewScreen from "../src/app/photo-preview";
import { createFakeApi } from "../test-utils";
import { getPendingPhoto } from "../src/lib/pendingPhoto";

let mockPermission: { granted: boolean; canAskAgain: boolean };
const mockRequestCameraPermission = jest.fn();

jest.mock("expo-camera", () => {
  return {
    CameraView: () => null,
    useCameraPermissions: () => [mockPermission, mockRequestCameraPermission],
  };
});

jest.mock("expo-haptics", () => ({
  notificationAsync: jest.fn().mockResolvedValue(undefined),
  NotificationFeedbackType: { Success: "success" },
}));

jest.mock("expo-image-picker", () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));

const routes = {
  capture: CaptureScreen,
  "photo-preview": PhotoPreviewScreen,
  ask: () => null,
};

const photoUrl =
  "/photo-preview?uri=file%3A%2F%2F%2Ftmp%2Fphoto.jpg&name=photo.jpg&type=image%2Fjpeg";

beforeEach(() => {
  mockPermission = { granted: false, canAskAgain: true };
  mockRequestCameraPermission.mockReset().mockResolvedValue({ granted: false });
  jest.mocked(ImagePicker.requestMediaLibraryPermissionsAsync).mockReset();
  jest.mocked(ImagePicker.launchImageLibraryAsync).mockReset();
});

afterEach(() => jest.restoreAllMocks());

describe("camera permission handoff", () => {
  test("explains denial and offers Settings and library actions", async () => {
    mockPermission = { granted: false, canAskAgain: false };
    await renderRouter(routes, { initialUrl: "/capture" });

    expect(
      screen.getByText(/Camera access is off\. You can enable it/),
    ).toBeOnTheScreen();
    expect(
      screen.getByRole("button", { name: "Open Settings" }),
    ).toBeOnTheScreen();
    expect(
      screen.getByRole("button", { name: "Choose from Library" }),
    ).toBeOnTheScreen();
  });

  test("shows the reason before requesting camera access", async () => {
    await renderRouter(routes, { initialUrl: "/capture" });

    expect(
      screen.getByText(
        "AskSight needs the camera to see what you want to ask about.",
      ),
    ).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(mockRequestCameraPermission).toHaveBeenCalled());
  });
});

describe("photo library and upload flow", () => {
  test("requests library access then shows the selected photo", async () => {
    jest
      .mocked(ImagePicker.requestMediaLibraryPermissionsAsync)
      .mockResolvedValue({
        granted: true,
      } as ImagePicker.MediaLibraryPermissionResponse);
    jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValue({
      canceled: false,
      assets: [
        {
          uri: "file:///picked.png",
          fileName: "picked.png",
          mimeType: "image/png",
          width: 20,
          height: 20,
          assetId: null,
          fileSize: 100,
          type: "image",
          base64: null,
          duration: null,
        },
      ],
    } as ImagePicker.ImagePickerResult);

    await renderRouter(routes, { initialUrl: "/photo-preview?pick=1" });

    await waitFor(() =>
      expect(screen.getByLabelText("Your photo")).toBeOnTheScreen(),
    );
    expect(ImagePicker.requestMediaLibraryPermissionsAsync).toHaveBeenCalled();
    expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledWith({
      mediaTypes: ["images"],
      quality: 0.8,
    });
  });

  test("shows upload failure and succeeds on retry", async () => {
    const fakeApi = createFakeApi();
    fakeApi.uploadImage.mockRejectedValueOnce(
      new api.ApiError("The network is down.", 503, null),
    );
    jest.spyOn(api, "uploadImage").mockImplementation(fakeApi.uploadImage);
    const router = await renderRouter(routes, { initialUrl: photoUrl });

    await fireEvent.press(screen.getByRole("button", { name: "Use Photo" }));
    expect(await screen.findByText("The network is down.")).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Try Again" }));

    await waitFor(() => expect(router.getPathname()).toBe("/ask"));
    expect(fakeApi.uploadImage).toHaveBeenCalledTimes(2);
    expect(getPendingPhoto()).toBeNull();
  });

  test("shows the backend oversized-photo message and allows choosing another", async () => {
    const fakeApi = createFakeApi();
    fakeApi.uploadImage.mockRejectedValue(
      new api.ApiError("That image is too large.", 413, null),
    );
    jest.spyOn(api, "uploadImage").mockImplementation(fakeApi.uploadImage);
    await renderRouter(routes, { initialUrl: photoUrl });

    await fireEvent.press(screen.getByRole("button", { name: "Use Photo" }));

    expect(
      await screen.findByText("That image is too large."),
    ).toBeOnTheScreen();
    expect(
      screen.getByRole("button", { name: "Choose Another" }),
    ).toBeEnabled();
  });
});
