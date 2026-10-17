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

// The backend returns `detail` as a human sentence on 401/409 but as an array
// of technical validation issues on 422. Everything the user sees is a
// complete plain-language sentence — no status codes or field paths.
function friendlyValidation(issue: ValidationIssue | null): string {
  const field = issue?.loc?.[issue.loc.length - 1];
  const msg = issue?.msg ?? "";
  if (field === "email" || /email/i.test(msg)) {
    return "Please enter a valid email address.";
  }
  if (field === "password" || /password/i.test(msg)) {
    return "Please pick a password with at least 8 characters.";
  }
  if (field === "name" || /name/i.test(msg)) {
    return "Please enter your name.";
  }
  return "Please check the information you entered and try again.";
}

export async function readError(res: Response): Promise<string> {
  try {
    const body = await res.json();
    const detail = body?.detail;

    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) {
      const messages = Array.from(
        new Set(
          detail.map((issue: ValidationIssue | null) =>
            friendlyValidation(issue),
          ),
        ),
      );
      if (messages.length > 0) return messages.join(" ");
    }
  } catch {
    // non-JSON error body
  }
  if (res.status >= 500) {
    return "AskSight is having trouble right now. Please try again in a moment.";
  }
  if (res.status === 401) {
    return "Your session has expired. Please sign in again.";
  }
  if (res.status === 409) {
    return "An account with this email already exists. Try signing in instead.";
  }
  if (res.status === 422) {
    return "Please check the information you entered and try again.";
  }
  return "We couldn't complete that request. Please try again.";
}

// fetch() rejects with a bare TypeError on connection failure; anything else
// bubbles up as an Error whose message is already user-facing. Replace only
// the technical cases so the form never shows "Network request failed".
export function toFriendlyMessage(cause: unknown, fallback: string): string {
  if (!(cause instanceof Error) || !cause.message) return fallback;
  if (
    /network request failed|failed to fetch|network error/i.test(cause.message)
  ) {
    return "We couldn't connect to AskSight. Check your internet connection and try again.";
  }
  return cause.message;
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
