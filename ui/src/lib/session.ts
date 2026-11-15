import * as SecureStore from "expo-secure-store";

// The access token lives in memory only: it lasts 30 minutes and is replaced by
// /auth/refresh on 401, so it never needs to survive a restart. The refresh
// token does, and it is the one value that must stay encrypted at rest.
const REFRESH_TOKEN_KEY = "asksight.refresh_token";

let accessToken: string | null = null;

export function getAccessToken() {
  return accessToken;
}

export function setAccessToken(token: string | null) {
  accessToken = token;
}

// SecureStore is unavailable on web and can fail on a locked device. Treat any
// read failure as "signed out" rather than crashing startup.
export async function getRefreshToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function setRefreshToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, token);
}

export async function clearRefreshToken(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
  } catch {
    // Nothing useful to do: the in-memory token is already gone.
  }
}
