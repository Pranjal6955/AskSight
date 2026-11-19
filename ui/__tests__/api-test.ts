import {
  ApiError,
  readError,
  toFriendlyMessage,
  signup,
  login,
  me,
  refresh,
  uploadImage,
  getImage,
  deleteHistoryEntry,
  ask,
  transcribe,
  synthesize,
  listHistory,
  getHistoryEntry,
  deleteAllHistory,
  deleteImage,
  logout,
  setSessionExpiredHandler,
} from "../src/lib/api";
import {
  getAccessToken,
  getRefreshToken,
  setAccessToken,
  setRefreshToken,
} from "../src/lib/session";

// The jest environment resolves expo-file-system to the web shim, whose File
// is not a Blob. Native File implements Blob, so mirror that contract here.
jest.mock("expo-file-system", () => ({
  File: class extends Blob {
    constructor(uri: string) {
      super([uri]);
    }
  },
}));

const USER = {
  id: "1",
  name: "John Smith",
  email: "john@example.com",
  createdAt: "2026-01-01T00:00:00Z",
};

const fakeResponse = (status: number, body: unknown) =>
  ({
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
    headers: new Headers({ "Content-Type": "application/json" }),
  }) as unknown as Response;

const jsonBody = (
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });

afterEach(() => {
  jest.restoreAllMocks();
  setAccessToken(null);
  setSessionExpiredHandler(null);
});

describe("readError", () => {
  test("uses the human detail string returned by 401", async () => {
    const err = await readError(
      fakeResponse(401, { detail: "Invalid email or Password" }),
    );
    expect(err).toBe("Invalid email or Password");
  });

  test("uses the human detail string returned by 409", async () => {
    const err = await readError(
      fakeResponse(409, {
        detail: "An Account with this email Already exists",
      }),
    );
    expect(err).toBe("An Account with this email Already exists");
  });

  test("turns validation issues on 422 into friendly sentences", async () => {
    const err = await readError(
      fakeResponse(422, {
        detail: [
          {
            loc: ["body", "name"],
            msg: "String should have at least 2 characters",
          },
          {
            loc: ["body", "email"],
            msg: "value is not a valid email address",
          },
        ],
      }),
    );
    expect(err).toBe(
      "Please enter your name. Please enter a valid email address.",
    );
  });

  test("maps a password validation issue to a friendly sentence", async () => {
    const err = await readError(
      fakeResponse(422, {
        detail: [{ loc: ["body", "password"], msg: "String too short" }],
      }),
    );
    expect(err).toBe("Please pick a password with at least 8 characters.");
  });

  test("deduplicates repeated friendly messages", async () => {
    const err = await readError(
      fakeResponse(422, {
        detail: [
          { loc: ["body", "email"], msg: "value is not a valid email address" },
          { loc: ["body", "email"], msg: "invalid email" },
        ],
      }),
    );
    expect(err).toBe("Please enter a valid email address.");
  });

  test("falls back to a friendly sentence when the body is not JSON", async () => {
    const res = {
      status: 502,
      json: async () => {
        throw new Error("not json");
      },
    } as unknown as Response;
    expect(await readError(res)).toBe(
      "AskSight is having trouble right now. Please try again in a moment.",
    );
  });

  test("falls back to a friendly sentence when detail is missing on 500", async () => {
    const err = await readError(fakeResponse(500, {}));
    expect(err).toBe(
      "AskSight is having trouble right now. Please try again in a moment.",
    );
  });

  test("falls back to a friendly sentence when detail is missing on 401", async () => {
    const err = await readError(fakeResponse(401, {}));
    expect(err).toBe("Your session has expired. Please sign in again.");
  });

  test("falls back to a friendly sentence when detail is missing on 409", async () => {
    const err = await readError(fakeResponse(409, {}));
    expect(err).toBe(
      "An account with this email already exists. Try signing in instead.",
    );
  });

  test("falls back to a friendly sentence on an empty validation array", async () => {
    const err = await readError(fakeResponse(422, { detail: [] }));
    expect(err).toBe("Please check the information you entered and try again.");
  });

  test("falls back to a friendly sentence when detail is an unexpected type", async () => {
    const err = await readError(fakeResponse(400, { detail: 42 }));
    expect(err).toBe("We couldn't complete that request. Please try again.");
  });
});

describe("toFriendlyMessage", () => {
  const FALLBACK = "We couldn't sign you in. Please try again.";

  test("replaces a network failure with a connection message", () => {
    expect(
      toFriendlyMessage(new TypeError("Network request failed"), FALLBACK),
    ).toBe(
      "We couldn't connect to AskSight. Check your internet connection and try again.",
    );
  });

  test("replaces a fetch failure with a connection message", () => {
    expect(toFriendlyMessage(new Error("Failed to fetch"), FALLBACK)).toBe(
      "We couldn't connect to AskSight. Check your internet connection and try again.",
    );
  });

  test("keeps an already human message", () => {
    expect(
      toFriendlyMessage(new Error("Invalid email or Password"), FALLBACK),
    ).toBe("Invalid email or Password");
  });

  test("uses the fallback for non-Error rejections", () => {
    expect(toFriendlyMessage("network failure", FALLBACK)).toBe(FALLBACK);
  });

  test("uses the fallback for an empty message", () => {
    expect(toFriendlyMessage(new Error(""), FALLBACK)).toBe(FALLBACK);
  });
});

describe("signup", () => {
  test("sends a POST request to /auth/signup with the user data", async () => {
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "1",
          name: "John Doe",
          email: "john@example.com",
          createdAt: "2026-01-01T00:00:00Z",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const result = await signup({
      name: "John Doe",
      email: "john@example.com",
      password: "hunter2!",
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining("/auth/signup"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          name: "John Doe",
          email: "john@example.com",
          password: "hunter2!",
        }),
      }),
    );
    expect(result).toEqual({
      id: "1",
      name: "John Doe",
      email: "john@example.com",
      createdAt: "2026-01-01T00:00:00Z",
    });

    fetchSpy.mockRestore();
  });

  test("throws an error with the backend message on failure", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          detail: "An Account with this email Already exists",
        }),
        { status: 409, headers: { "Content-Type": "application/json" } },
      ),
    );

    await expect(
      signup({
        name: "John Doe",
        email: "john@example.com",
        password: "hunter2!",
      }),
    ).rejects.toThrow("An Account with this email Already exists");
  });
});

describe("login", () => {
  test("sends a POST request to /auth/login with credentials", async () => {
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: "abc123",
          refresh_token: "refresh123",
          token_type: "bearer",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const result = await login({
      email: "john@example.com",
      password: "hunter2!",
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining("/auth/login"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          email: "john@example.com",
          password: "hunter2!",
        }),
      }),
    );
    expect(result).toEqual({
      access_token: "abc123",
      refresh_token: "refresh123",
      token_type: "bearer",
    });

    fetchSpy.mockRestore();
  });

  test("throws an error with the backend message on invalid credentials", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ detail: "Invalid email or Password" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(
      login({ email: "john@example.com", password: "wrong" }),
    ).rejects.toThrow("Invalid email or Password");
  });
});

describe("me", () => {
  test("sends a GET request to /auth/me with the bearer token", async () => {
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "1",
          name: "John Smith",
          email: "john@example.com",
          createdAt: "2026-01-01T00:00:00Z",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const result = await me("token123");

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining("/auth/me"),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer token123",
        }),
      }),
    );
    expect(result).toEqual({
      id: "1",
      name: "John Smith",
      email: "john@example.com",
      createdAt: "2026-01-01T00:00:00Z",
    });

    fetchSpy.mockRestore();
  });

  test("throws an error when the token is invalid", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ detail: "Could not validate credentials" }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    await expect(me("bad-token")).rejects.toThrow(
      "Could not validate credentials",
    );
  });
});

describe("error fallbacks", () => {
  test.each([
    [413, "That file is too large. Please choose a smaller one."],
    [415, "That file type is not supported. Please choose a different file."],
    [429, "Too many requests. Please wait a moment and try again."],
    [503, "The model is unavailable right now. Please try again later."],
    [504, "The model took too long to answer. Please try again."],
  ])("maps %i to a plain-language sentence", async (status, expected) => {
    expect(await readError(fakeResponse(status, {}))).toBe(expected);
  });

  test.each([
    ["question", "Please enter a question of 500 characters or fewer."],
    ["text", "There is no text to read aloud."],
    ["image_id", "Please choose a photo first."],
    ["file", "Please choose a file."],
    ["refresh_token", "Your session has expired. Please sign in again."],
  ])("maps a %s validation issue", async (field, expected) => {
    const err = await readError(
      fakeResponse(422, { detail: [{ loc: ["body", field], msg: "" }] }),
    );
    expect(err).toBe(expected);
  });
});

describe("refresh", () => {
  test("posts the refresh token and returns the rotated pair", async () => {
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonBody(200, {
        access_token: "a2",
        refresh_token: "r2",
        token_type: "bearer",
      }),
    );

    const result = await refresh("r1");

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining("/auth/refresh"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ refresh_token: "r1" }),
      }),
    );
    expect(result).toEqual({
      access_token: "a2",
      refresh_token: "r2",
      token_type: "bearer",
    });
  });
});

describe("session-aware requests", () => {
  test("refreshes once on 401, retries, and persists the rotated token", async () => {
    setAccessToken("old");
    await setRefreshToken("r1");

    const fetchSpy = jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonBody(401, { detail: "expired" }))
      .mockResolvedValueOnce(
        jsonBody(200, {
          access_token: "new",
          refresh_token: "r2",
          token_type: "bearer",
        }),
      )
      .mockResolvedValueOnce(jsonBody(200, USER));

    await expect(me()).resolves.toEqual(USER);

    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(fetchSpy.mock.calls[1][0]).toContain("/auth/refresh");
    expect(fetchSpy.mock.calls[2][1]?.headers).toEqual(
      expect.objectContaining({ Authorization: "Bearer new" }),
    );
    expect(getAccessToken()).toBe("new");
    expect(await getRefreshToken()).toBe("r2");
  });

  test("a rejected refresh clears the session and notifies the app", async () => {
    const handler = jest.fn();
    setSessionExpiredHandler(handler);
    setAccessToken("old");
    await setRefreshToken("r1");

    jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonBody(401, { detail: "expired" }))
      .mockResolvedValueOnce(
        jsonBody(401, {
          detail: "Invalid or expired session. Please sign in again.",
        }),
      );

    await expect(me()).rejects.toBeInstanceOf(ApiError);

    expect(handler).toHaveBeenCalledWith(
      "Invalid or expired session. Please sign in again.",
    );
    expect(getAccessToken()).toBeNull();
    expect(await getRefreshToken()).toBeNull();
  });

  test("two simultaneous 401s share a single refresh", async () => {
    setAccessToken("old");
    await setRefreshToken("r1");

    let releaseRefresh = () => {};
    const gate = new Promise<void>((resolve) => {
      releaseRefresh = resolve;
    });
    let refreshCalls = 0;

    jest.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      if (String(input).includes("/auth/refresh")) {
        refreshCalls += 1;
        await gate;
        return jsonBody(200, {
          access_token: "new",
          refresh_token: "r2",
          token_type: "bearer",
        });
      }
      const headers = (init?.headers ?? {}) as Record<string, string>;
      return headers.Authorization === "Bearer new"
        ? jsonBody(200, USER)
        : jsonBody(401, { detail: "expired" });
    });

    const first = me();
    const second = me();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(refreshCalls).toBe(1);
    releaseRefresh();
    await expect(Promise.all([first, second])).resolves.toEqual([USER, USER]);
  });

  test("captures the request id on an API error", async () => {
    setAccessToken("t");

    jest.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonBody(
        400,
        { detail: "That request was not valid." },
        {
          "X-Request-ID": "req-1",
        },
      ),
    );

    await expect(me()).rejects.toMatchObject({
      message: "That request was not valid.",
      status: 400,
      requestId: "req-1",
    });
  });
});

describe("delete", () => {
  test("returns void for a 204 with no body", async () => {
    setAccessToken("t");
    const fetchSpy = jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 204 }));

    await expect(deleteHistoryEntry("id 1")).resolves.toBeUndefined();

    expect(fetchSpy.mock.calls[0][0]).toContain("/history/id%201");
    expect(fetchSpy.mock.calls[0][1]?.method).toBe("DELETE");
  });

  test("deletes all history and an image with the expected routes", async () => {
    setAccessToken("t");
    const fetchSpy = jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 204 }));

    await deleteAllHistory();
    await deleteImage("image 1");

    expect(fetchSpy.mock.calls[0][0]).toContain("/history");
    expect(fetchSpy.mock.calls[0][1]?.method).toBe("DELETE");
    expect(fetchSpy.mock.calls[1][0]).toContain("/images/image%201");
    expect(fetchSpy.mock.calls[1][1]?.method).toBe("DELETE");
  });
});

describe("Q&A and speech requests", () => {
  beforeEach(() => setAccessToken("t"));

  test("posts an image id and question to /ask", async () => {
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonBody(200, {
        entry_id: "e1",
        answer: "A cup.",
        model_version: "mock-0.0.0",
        created_at: "2026-01-01T00:00:00Z",
      }),
    );

    await expect(ask("img-1", "What is this?")).resolves.toMatchObject({
      entry_id: "e1",
    });
    expect(fetchSpy.mock.calls[0][0]).toContain("/ask");
    expect(fetchSpy.mock.calls[0][1]).toMatchObject({
      method: "POST",
      headers: expect.objectContaining({
        Authorization: "Bearer t",
        "Content-Type": "application/json",
      }),
      body: JSON.stringify({ image_id: "img-1", question: "What is this?" }),
    });
  });

  test("passes cancellation to /ask and retains an answer in a history failure", async () => {
    const controller = new AbortController();
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonBody(500, {
        detail: "The answer could not be saved to history.",
        answer: "A red car.",
        model_version: "mock-0.0.0",
      }),
    );

    await expect(
      ask("img-1", "What is this?", controller.signal),
    ).rejects.toMatchObject({
      status: 500,
      message: "The answer could not be saved to history.",
      payload: {
        answer: "A red car.",
        model_version: "mock-0.0.0",
      },
    });
    expect(fetchSpy.mock.calls[0][1]?.signal).toBe(controller.signal);
  });

  test("transcribes multipart audio without setting content type manually", async () => {
    const fetchSpy = jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        jsonBody(200, { transcript: "Read this sign", language: "en-IN" }),
      );

    await expect(
      transcribe({
        uri: "file:///voice.m4a",
        name: "voice.m4a",
        type: "audio/mp4",
      }),
    ).resolves.toMatchObject({ transcript: "Read this sign" });
    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    expect(fetchSpy.mock.calls[0][0]).toContain("/stt");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({ Authorization: "Bearer t" });
    expect(
      (init.headers as Record<string, string>)["Content-Type"],
    ).toBeUndefined();
    expect(init.body).toBeInstanceOf(FormData);
  });

  test("synthesizes speech with optional language and voice", async () => {
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(new Uint8Array([1, 2]), {
        status: 200,
        headers: { "Content-Type": "audio/mpeg" },
      }),
    );

    await expect(
      synthesize("Hello", "en-IN", "speaker"),
    ).resolves.toMatchObject({
      mimeType: "audio/mpeg",
    });
    expect(fetchSpy.mock.calls[0][0]).toContain("/tts");
    expect(fetchSpy.mock.calls[0][1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        text: "Hello",
        language: "en-IN",
        voice: "speaker",
      }),
    });
  });
});

describe("history requests", () => {
  beforeEach(() => setAccessToken("t"));

  test("lists history with cursor and page size", async () => {
    const fetchSpy = jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        jsonBody(200, { items: [], next_cursor: null, has_more: false }),
      );

    await listHistory({ cursor: "next page", limit: 10 });

    expect(fetchSpy.mock.calls[0][0]).toContain(
      "/history?cursor=next%20page&limit=10",
    );
    expect(fetchSpy.mock.calls[0][1]?.headers).toMatchObject({
      Authorization: "Bearer t",
    });
  });

  test("loads one history entry by encoded id", async () => {
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonBody(200, {
        id: "h1",
        question: "Q?",
        answer: "A",
        image_id: "i1",
      }),
    );

    await getHistoryEntry("history 1");

    expect(fetchSpy.mock.calls[0][0]).toContain("/history/history%201");
    expect(fetchSpy.mock.calls[0][1]?.headers).toMatchObject({
      Authorization: "Bearer t",
    });
  });

  test("logs out with the refresh token", async () => {
    const fetchSpy = jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 204 }));

    await logout("r1");

    expect(fetchSpy.mock.calls[0][0]).toContain("/auth/logout");
    expect(fetchSpy.mock.calls[0][1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({ refresh_token: "r1" }),
    });
  });
});

describe("uploads and downloads", () => {
  test("lets fetch set the multipart boundary", async () => {
    setAccessToken("t");
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonBody(201, {
        id: "img1",
        mime_type: "image/png",
        size_bytes: 3,
        width: 1,
        height: 1,
        created_at: "2026-01-01T00:00:00Z",
      }),
    );

    await uploadImage({
      uri: "file:///a.png",
      name: "a.png",
      type: "image/png",
    });

    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe(
      undefined,
    );
    expect(init.body).toBeInstanceOf(FormData);
  });

  test("returns image bytes with the response content type", async () => {
    setAccessToken("t");
    jest.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { "Content-Type": "image/png" },
      }),
    );

    const result = await getImage("img1");

    expect(result.mimeType).toBe("image/png");
    expect(new Uint8Array(result.bytes)).toEqual(new Uint8Array([1, 2, 3]));
  });
});
