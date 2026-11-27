import * as SecureStore from "expo-secure-store";

import {
  clearRefreshToken,
  getRefreshToken,
  setRefreshToken,
} from "@/lib/storage";

jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

const getItemAsync = SecureStore.getItemAsync as jest.Mock;
const setItemAsync = SecureStore.setItemAsync as jest.Mock;
const deleteItemAsync = SecureStore.deleteItemAsync as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe("refresh token storage", () => {
  it("reads the stored token", async () => {
    getItemAsync.mockResolvedValue("refresh-token");

    await expect(getRefreshToken()).resolves.toBe("refresh-token");
    expect(getItemAsync).toHaveBeenCalledWith("asksight.refresh_token");
  });

  it("writes and clears the token", async () => {
    await setRefreshToken("refresh-token");
    await clearRefreshToken();

    expect(setItemAsync).toHaveBeenCalledWith(
      "asksight.refresh_token",
      "refresh-token",
    );
    expect(deleteItemAsync).toHaveBeenCalledWith("asksight.refresh_token");
  });

  it("returns null when secure storage is unavailable", async () => {
    getItemAsync.mockRejectedValue(new Error("storage blocked"));

    await expect(getRefreshToken()).resolves.toBeNull();
  });

  it("does not block sign-out when clearing fails", async () => {
    deleteItemAsync.mockRejectedValue(new Error("storage blocked"));

    await expect(clearRefreshToken()).resolves.toBeUndefined();
  });
});
