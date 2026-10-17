import { readError, signup, login, me } from "../src/lib/api";

const fakeResponse = (status: number, body: unknown) =>
  ({ status, json: async () => body }) as unknown as Response;

describe("readError", () => {
  test("uses the detail string returned by 401", async () => {
    const err = await readError(
      fakeResponse(401, { detail: "Invalid email or Password" }),
    );
    expect(err).toBe("Invalid email or Password");
  });

  test("uses the detail string returned by 409", async () => {
    const err = await readError(
      fakeResponse(409, { detail: "An Account with this email Already exists" }),
    );
    expect(err).toBe("An Account with this email Already exists");
  });

  test("joins validation issues returned as an array on 422", async () => {
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
      "String should have at least 2 characters, value is not a valid email address",
    );
  });

  test("handles a single validation issue in the array", async () => {
    const err = await readError(
      fakeResponse(422, {
        detail: [
          { loc: ["body", "password"], msg: "Password too weak" },
        ],
      }),
    );
    expect(err).toBe("Password too weak");
  });

  test("filters out issues without a message", async () => {
    const err = await readError(
      fakeResponse(422, {
        detail: [
          { loc: ["body", "name"], msg: "Name too short" },
          { loc: ["body", "email"] },
        ],
      }),
    );
    expect(err).toBe("Name too short");
  });

  test("falls back to the status when the body is not JSON", async () => {
    const res = {
      status: 502,
      json: async () => {
        throw new Error("not json");
      },
    } as unknown as Response;
    expect(await readError(res)).toBe("Request failed (502)");
  });

  test("falls back to the status when detail is missing", async () => {
    const err = await readError(fakeResponse(500, {}));
    expect(err).toBe("Request failed (500)");
  });

  test("falls back to the status when detail is an empty array", async () => {
    const err = await readError(fakeResponse(422, { detail: [] }));
    expect(err).toBe("Request failed (422)");
  });

  test("falls back to the status when detail is an unexpected type", async () => {
    const err = await readError(fakeResponse(400, { detail: 42 }));
    expect(err).toBe("Request failed (400)");
  });
});

describe("signup", () => {
  test("sends a POST request to /auth/signup with the user data", async () => {
    const fetchSpy = jest.spyOn(global, "fetch").mockResolvedValue(
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
    jest.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ detail: "An Account with this email Already exists" }),
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
    const fetchSpy = jest.spyOn(global, "fetch").mockResolvedValue(
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
    jest.spyOn(global, "fetch").mockResolvedValue(
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
    const fetchSpy = jest.spyOn(global, "fetch").mockResolvedValue(
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
    jest.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ detail: "Could not validate credentials" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(me("bad-token")).rejects.toThrow(
      "Could not validate credentials",
    );
  });
});
