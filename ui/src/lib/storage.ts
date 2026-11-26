import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const REFRESH_TOKEN_KEY = "asksight.refresh_token";

function webStorage(): Storage | null {
  if (typeof localStorage === "undefined") return null;
  return localStorage;
}

export async function getRefreshToken(): Promise<string | null> {
  if (Platform.OS === "web") {
    try {
      return webStorage()?.getItem(REFRESH_TOKEN_KEY) ?? null;
    } catch {
      return null;
    }
  }

  try {
    return await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function setRefreshToken(token: string): Promise<void> {
  if (Platform.OS === "web") {
    webStorage()?.setItem(REFRESH_TOKEN_KEY, token);
    return;
  }

  await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, token);
}

export async function clearRefreshToken(): Promise<void> {
  if (Platform.OS === "web") {
    try {
      webStorage()?.removeItem(REFRESH_TOKEN_KEY);
    } catch {
      // Storage can be blocked (private mode); the session is still cleared
      // from memory by the auth provider.
    }
    return;
  }

  try {
    await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
  } catch {
    // Same as web: never block sign-out on storage cleanup.
  }
}
