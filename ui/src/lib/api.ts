const BASE_URL = (
  process.env.EXPO_PUBLIC_API_URL ?? "http://10.0.2.2:8000"
).replace(/\/$/, "");

export type User = {
  id: string;
  name: string;
  email: string;
  createdAt: string;
};

export type TokenResponse = {
  access_token: string;
  token_type: string;
};

type ValidationIssue = {
  loc?: (string | number)[];
  msg?: string;
};

async function request<T>(
  path: string,
  init: RequestInit = {},
  token?: string,
): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });

  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as T;
}

// The backend returns `detail` as a string on 401/409 but as an array of
// validation issues on 422. Normalise both to one readable sentence.
export async function readError(res: Response): Promise<string> {
  const fallback = `Request failed (${res.status})`;
  try {
    const body = await res.json();
    const detail = body?.detail;

    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) {
      const msgs = detail
        .map((issue: ValidationIssue) => issue?.msg)
        .filter(Boolean);
      if (msgs.length > 0) return msgs.join(", ");
    }
  } catch {
    // non-JSON error body
  }
  return fallback;
}

export function signup(input: {
  name: string;
  email: string;
  password: string;
}) {
  return request<User>("/auth/signup", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function login(input: { email: string; password: string }) {
  return request<TokenResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function me(token: string) {
  return request<User>("/auth/me", {}, token);
}
