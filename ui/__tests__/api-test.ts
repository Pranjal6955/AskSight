import {
  readError,
  toFriendlyMessage,
  signup,
  login,
  me,
} from "../src/lib/api";

const fakeResponse = (status: number, body: unknown) =>
  ({ status, json: async () => body }) as unknown as Response;

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
    const fetchSpy = jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(
          JSON.stringify({ access_token: "abc123", token_type: "bearer" }),
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
    expect(result).toEqual({ access_token: "abc123", token_type: "bearer" });

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
