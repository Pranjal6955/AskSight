import { act, renderHook, waitFor } from "@testing-library/react-native";
import type { PropsWithChildren } from "react";

import { ApiError, type Tokens, type User } from "@/lib/api";
import { AuthProvider, useAuth } from "@/lib/auth";
import * as api from "@/lib/api";
import {
  clearRefreshToken,
  getRefreshToken,
  setRefreshToken,
} from "@/lib/storage";

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    login: jest.fn(),
    signup: jest.fn(),
    refresh: jest.fn(),
    me: jest.fn(),
    logout: jest.fn(),
  };
});

jest.mock("@/lib/storage", () => ({
  getRefreshToken: jest.fn(),
  setRefreshToken: jest.fn(),
  clearRefreshToken: jest.fn(),
}));

const credentials = { email: "ada@example.com", password: "password123" };
const user: User = {
  id: "1",
  name: "Ada",
  email: credentials.email,
  createdAt: "today",
};
const tokens: Tokens = {
  access_token: "access-1",
  refresh_token: "refresh-1",
  token_type: "bearer",
};

const login = api.login as jest.Mock;
const refresh = api.refresh as jest.Mock;
const me = api.me as jest.Mock;
const logout = api.logout as jest.Mock;
const storedToken = getRefreshToken as jest.Mock;

function Wrapper({ children }: PropsWithChildren) {
  return <AuthProvider>{children}</AuthProvider>;
}

async function renderAuth() {
  const hook = await renderHook(() => useAuth(), { wrapper: Wrapper });
  expect(hook.result.current.authReady).toBe(true);
  return hook;
}

beforeEach(() => {
  jest.clearAllMocks();
  storedToken.mockResolvedValue(null);
  login.mockResolvedValue(tokens);
  refresh.mockResolvedValue(tokens);
  me.mockResolvedValue(user);
  logout.mockResolvedValue(undefined);
});

describe("AuthProvider", () => {
  it("signs in and loads the profile", async () => {
    const { result } = await renderAuth();

    await act(async () => {
      await result.current.signIn(credentials);
    });

    expect(login).toHaveBeenCalledWith(credentials);
    expect(setRefreshToken).toHaveBeenCalledWith("refresh-1");
    expect(me).toHaveBeenCalledWith("access-1");
    expect(result.current.accessToken).toBe("access-1");
    expect(result.current.user).toEqual(user);
  });

  it("retries with a fresh token after a 401", async () => {
    const { result } = await renderAuth();
    await act(async () => {
      await result.current.signIn(credentials);
    });
    storedToken.mockResolvedValue("refresh-1");
    refresh.mockResolvedValue({
      ...tokens,
      access_token: "access-2",
      refresh_token: "refresh-2",
    });
    const operation = jest
      .fn<Promise<string>, [string]>()
      .mockRejectedValueOnce(new ApiError("expired", 401))
      .mockResolvedValueOnce("ok");

    await act(async () => {
      await expect(result.current.withAuth(operation)).resolves.toBe("ok");
    });

    expect(operation).toHaveBeenNthCalledWith(1, "access-1");
    expect(operation).toHaveBeenNthCalledWith(2, "access-2");
    expect(refresh).toHaveBeenCalledWith("refresh-1");
    expect(setRefreshToken).toHaveBeenCalledWith("refresh-2");
  });

  it("does not pass non-auth failures to refresh", async () => {
    const { result } = await renderAuth();
    await act(async () => {
      await result.current.signIn(credentials);
    });
    const failure = new ApiError("server error", 500);

    await act(async () => {
      await expect(
        result.current.withAuth(() => Promise.reject(failure)),
      ).rejects.toBe(failure);
    });

    expect(refresh).not.toHaveBeenCalled();
  });

  it("shares one refresh between parallel requests", async () => {
    const { result } = await renderAuth();
    await act(async () => {
      await result.current.signIn(credentials);
    });
    storedToken.mockResolvedValue("refresh-1");
    let completeRefresh: (value: Tokens) => void = () => {};
    refresh.mockReturnValue(
      new Promise<Tokens>((resolve) => {
        completeRefresh = resolve;
      }),
    );
    const operation = jest.fn(() =>
      Promise.reject(new ApiError("expired", 401)),
    );

    let first!: Promise<unknown>;
    let second!: Promise<unknown>;
    await act(async () => {
      first = result.current.withAuth(operation);
      second = result.current.withAuth(operation);
      await Promise.resolve();
    });
    expect(refresh).toHaveBeenCalledTimes(1);

    await act(async () => {
      completeRefresh(tokens);
      await Promise.allSettled([first, second]);
    });
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("restores a returning user from stored credentials", async () => {
    storedToken.mockResolvedValue("stored-refresh");
    refresh.mockResolvedValue({ ...tokens, access_token: "restored-access" });

    const { result } = await renderAuth();

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledWith("stored-refresh");
    expect(me).toHaveBeenCalledWith("restored-access");
    expect(result.current.user).toEqual(user);
    expect(result.current.accessToken).toBe("restored-access");
  });

  it("clears the stored token when it is rejected", async () => {
    storedToken.mockResolvedValue("stored-refresh");
    refresh.mockRejectedValue(new ApiError("invalid token", 401));

    const { result } = await renderAuth();

    expect(clearRefreshToken).toHaveBeenCalled();
    expect(result.current.accessToken).toBeNull();
    expect(result.current.user).toBeNull();
  });

  it("signs out locally and revokes the stored token", async () => {
    const { result } = await renderAuth();
    await act(async () => {
      await result.current.signIn(credentials);
    });
    storedToken.mockResolvedValue("refresh-1");

    await act(async () => {
      result.current.signOut();
    });

    expect(result.current.user).toBeNull();
    expect(result.current.accessToken).toBeNull();
    expect(clearRefreshToken).toHaveBeenCalled();
    await waitFor(() => expect(logout).toHaveBeenCalledWith("refresh-1"));
  });
});

describe("useAuth", () => {
  it("requires an AuthProvider", async () => {
    await expect(renderHook(() => useAuth())).rejects.toThrow(
      "useAuth must be used inside <AuthProvider>",
    );
  });
});
