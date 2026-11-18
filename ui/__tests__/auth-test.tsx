import { act, renderHook, waitFor } from "@testing-library/react-native";

import * as api from "../src/lib/api";
import { useAuth } from "../src/lib/auth";
import {
  getAccessToken,
  getRefreshToken,
  setAccessToken,
  setRefreshToken,
} from "../src/lib/session";
import { Providers, TEST_USER } from "../test-utils";

const TOKENS = {
  access_token: "a1",
  refresh_token: "r1",
  token_type: "bearer",
};

async function renderAuth() {
  const view = await renderHook(() => useAuth(), { wrapper: Providers });
  await waitFor(() => expect(view.result.current.authReady).toBe(true));
  return view;
}

afterEach(() => {
  jest.restoreAllMocks();
  setAccessToken(null);
  api.setSessionExpiredHandler(null);
});

describe("session restore", () => {
  test("restores a valid session and persists the rotated token", async () => {
    await setRefreshToken("old-refresh");
    jest.spyOn(api, "refresh").mockResolvedValue({
      access_token: "a2",
      refresh_token: "r2",
      token_type: "bearer",
    });
    jest.spyOn(api, "me").mockResolvedValue(TEST_USER);

    const { result } = await renderAuth();

    expect(result.current.user).toEqual(TEST_USER);
    expect(getAccessToken()).toBe("a2");
    expect(await getRefreshToken()).toBe("r2");
  });

  test("lands signed out when no token is stored", async () => {
    const refresh = jest.spyOn(api, "refresh");

    const { result } = await renderAuth();

    expect(result.current.user).toBeNull();
    expect(refresh).not.toHaveBeenCalled();
  });

  test("clears a rejected token and explains why", async () => {
    await setRefreshToken("stale");
    jest
      .spyOn(api, "refresh")
      .mockRejectedValue(
        new api.ApiError(
          "Invalid or expired session. Please sign in again.",
          401,
          null,
        ),
      );

    const { result } = await renderAuth();

    expect(result.current.user).toBeNull();
    expect(result.current.sessionNotice).toBe(
      "Invalid or expired session. Please sign in again.",
    );
    expect(await getRefreshToken()).toBeNull();
  });

  test("keeps the token after a network failure", async () => {
    await setRefreshToken("keep-me");
    jest
      .spyOn(api, "refresh")
      .mockRejectedValue(new TypeError("Network request failed"));

    const { result } = await renderAuth();

    expect(result.current.user).toBeNull();
    expect(result.current.sessionNotice).toContain("couldn't connect");
    expect(await getRefreshToken()).toBe("keep-me");
  });

  test("drops to signed out when the API reports an expired session", async () => {
    let expire: ((message: string) => void) | null = null;
    jest
      .spyOn(api, "setSessionExpiredHandler")
      .mockImplementation((handler) => {
        expire = handler;
      });

    const { result } = await renderAuth();
    await act(() =>
      expire?.("Your session has expired. Please sign in again."),
    );

    expect(result.current.user).toBeNull();
    expect(result.current.sessionNotice).toBe(
      "Your session has expired. Please sign in again.",
    );
  });
});

describe("sign in and out", () => {
  test("sign in stores both tokens and the user", async () => {
    jest.spyOn(api, "login").mockResolvedValue(TOKENS);
    jest.spyOn(api, "me").mockResolvedValue(TEST_USER);

    const { result } = await renderAuth();
    await act(() => result.current.signIn({ email: "a@b.c", password: "pw" }));

    expect(result.current.user).toEqual(TEST_USER);
    expect(getAccessToken()).toBe("a1");
    expect(await getRefreshToken()).toBe("r1");
  });

  test("sign out clears locally even when the server call rejects", async () => {
    jest.spyOn(api, "login").mockResolvedValue(TOKENS);
    jest.spyOn(api, "me").mockResolvedValue(TEST_USER);
    const logout = jest
      .spyOn(api, "logout")
      .mockRejectedValue(new Error("offline"));

    const { result } = await renderAuth();
    await act(() => result.current.signIn({ email: "a@b.c", password: "pw" }));

    await act(() => result.current.signOut());

    expect(result.current.user).toBeNull();
    expect(getAccessToken()).toBeNull();
    await waitFor(async () => expect(await getRefreshToken()).toBeNull());
    await waitFor(() => expect(logout).toHaveBeenCalledWith("r1"));
  });
});
