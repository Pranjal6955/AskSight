import {
  API_URL,
  ApiError,
  ask,
  history,
  login,
  logout,
  signup,
  synthesizeSpeech,
} from "@/lib/api";

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    arrayBuffer: async () => new ArrayBuffer(0),
  } as Response;
}

function fetchMock(): jest.Mock {
  return globalThis.fetch as jest.Mock;
}

beforeEach(() => {
  globalThis.fetch = jest.fn() as unknown as typeof fetch;
});

describe("API requests", () => {
  it("posts signup details as JSON", async () => {
    const user = {
      id: "1",
      name: "Ada",
      email: "ada@example.com",
      createdAt: "today",
    };
    fetchMock().mockResolvedValue(jsonResponse(user));

    await expect(
      signup({
        name: "Ada",
        email: "ada@example.com",
        password: "password123",
      }),
    ).resolves.toEqual(user);
    expect(fetchMock()).toHaveBeenCalledWith(`${API_URL}/auth/signup`, {
      method: "POST",
      body: JSON.stringify({
        name: "Ada",
        email: "ada@example.com",
        password: "password123",
      }),
      headers: { "Content-Type": "application/json" },
    });
  });

  it("sends the access token when asking a question", async () => {
    fetchMock().mockResolvedValue(jsonResponse({ entry_id: "e1" }));

    await ask("access", { image_id: "img/1", question: "What is this?" });

    expect(fetchMock()).toHaveBeenCalledWith(`${API_URL}/ask`, {
      method: "POST",
      body: JSON.stringify({ image_id: "img/1", question: "What is this?" }),
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer access",
      },
    });
  });

  it("builds the history query with limit and cursor", async () => {
    fetchMock().mockResolvedValue(
      jsonResponse({ items: [], next_cursor: null, has_more: false }),
    );

    await history("access", 5, "image/1");

    const url = new URL(fetchMock().mock.calls[0][0] as string);
    expect(url.pathname).toBe("/history");
    expect(url.searchParams.get("limit")).toBe("5");
    expect(url.searchParams.get("cursor")).toBe("image/1");
    expect(fetchMock().mock.calls[0][1].headers).toEqual({
      Authorization: "Bearer access",
    });
  });

  it("requests speech with the access token", async () => {
    fetchMock().mockResolvedValue(jsonResponse(null));

    await synthesizeSpeech("access", "Namaste");

    expect(fetchMock().mock.calls[0][1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({ text: "Namaste", language: "en-IN" }),
      headers: { Authorization: "Bearer access" },
    });
  });

  it("treats 204 as an empty response", async () => {
    fetchMock().mockResolvedValue({ ok: true, status: 204 });

    await expect(logout("refresh")).resolves.toBeUndefined();
    expect(fetchMock().mock.calls[0][1].body).toBe(
      JSON.stringify({ refresh_token: "refresh" }),
    );
  });
});

describe("API errors", () => {
  it("uses the server's error detail", async () => {
    fetchMock().mockResolvedValue(
      jsonResponse({ detail: "Wrong password" }, 401),
    );

    await expect(
      login({ email: "ada@example.com", password: "nope" }),
    ).rejects.toMatchObject({
      name: "ApiError",
      status: 401,
      message: "Wrong password",
    });
  });

  it("turns validation issues into readable, deduplicated messages", async () => {
    fetchMock().mockResolvedValue(
      jsonResponse(
        {
          detail: [
            { loc: ["body", "email"], msg: "invalid email" },
            { loc: ["body", "email"], msg: "email already used" },
            { loc: ["body", "password"], msg: "too short" },
          ],
        },
        422,
      ),
    );

    await expect(
      signup({ name: "A", email: "bad", password: "1" }),
    ).rejects.toMatchObject({
      status: 422,
      message:
        "Please enter a valid email address. Please choose a password with at least 8 characters.",
    });
  });

  it.each([
    [409, "An account with this email already exists. Try signing in instead."],
    [429, "Too many attempts. Please wait a moment and try again."],
    [
      500,
      "AskSight is having trouble right now. Please try again in a moment.",
    ],
  ])("falls back to a status message for %i", async (status, message) => {
    fetchMock().mockResolvedValue(jsonResponse({}, status));

    await expect(
      login({ email: "ada@example.com", password: "password123" }),
    ).rejects.toMatchObject({
      message,
      status,
    });
  });

  it("handles non-JSON error bodies", async () => {
    fetchMock().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => {
        throw new SyntaxError("not json");
      },
    });

    await expect(
      login({ email: "ada@example.com", password: "password123" }),
    ).rejects.toMatchObject({
      message: "Invalid email or password.",
      status: 401,
    });
  });

  it("reports a connection error when fetch fails", async () => {
    fetchMock().mockRejectedValue(new TypeError("Network request failed"));

    await expect(
      ask("access", { image_id: "1", question: "Hi" }),
    ).rejects.toMatchObject({
      status: 0,
    });
    await expect(
      ask("access", { image_id: "1", question: "Hi" }),
    ).rejects.toBeInstanceOf(ApiError);
  });
});
