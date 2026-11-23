export type RequestResult = {
  ok: boolean;
  status: number;
  body: any;
  error: string;
};

export function errorMessage(cause: unknown): string {
  return cause instanceof Error && cause.message
    ? cause.message
    : "Something went wrong.";
}

export function parseError(body: any, status: number): string {
  const detail = body?.detail;
  if (typeof detail === "string" && detail.trim()) return detail;
  if (Array.isArray(detail)) {
    const parts = detail
      .map((item) => item?.msg || item?.detail || String(item))
      .filter(Boolean);
    if (parts.length) return parts.join(" ");
  }
  const fallback: Record<number, string> = {
    500: "The server hit an error (500). Check the backend logs, then retry.",
    502: "The backend is not reachable. Is it running?",
    503: "The service is temporarily unavailable. Try again in a moment.",
    504: "The request took too long. Try again.",
  };
  return fallback[status] || `Request failed (${status}).`;
}

export async function request(
  path: string,
  init: RequestInit = {},
  token = "",
): Promise<RequestResult> {
  const headers = new Headers(init.headers || {});
  if (token) headers.set("Authorization", `Bearer ${token}`);

  let res: Response;
  try {
    res = await fetch(path, { ...init, headers });
  } catch {
    throw new Error(
      "Cannot reach the backend. Start the API with uvicorn, then retry.",
    );
  }

  const text = await res.text();
  let body: any = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  return {
    ok: res.ok,
    status: res.status,
    body,
    error: res.ok ? "" : parseError(body, res.status),
  };
}
