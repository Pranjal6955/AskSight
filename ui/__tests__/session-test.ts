import * as SecureStore from "expo-secure-store";

import {
  clearRefreshToken,
  getAccessToken,
  getRefreshToken,
  setAccessToken,
  setRefreshToken,
} from "../src/lib/session";

afterEach(() => jest.restoreAllMocks());

describe("session storage", () => {
  test("keeps the access token in memory only", () => {
    setAccessToken("access-1");
    expect(getAccessToken()).toBe("access-1");
    setAccessToken(null);
    expect(getAccessToken()).toBeNull();
  });

  test("stores and clears the refresh token in secure storage", async () => {
    await setRefreshToken("refresh-1");
    expect(await getRefreshToken()).toBe("refresh-1");

    await clearRefreshToken();
    expect(await getRefreshToken()).toBeNull();
  });

  test("treats a storage read failure as signed out", async () => {
    jest
      .spyOn(SecureStore, "getItemAsync")
      .mockRejectedValueOnce(new Error("keychain locked"));

    await expect(getRefreshToken()).resolves.toBeNull();
  });
});
