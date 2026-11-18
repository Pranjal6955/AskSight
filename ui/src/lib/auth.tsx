import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import * as api from "./api";
import type { User } from "./api";
import {
  clearRefreshToken,
  getRefreshToken,
  setAccessToken,
  setRefreshToken,
} from "./session";

type AuthValue = {
  user: User | null;
  // False until the stored session has been checked, so the router can keep the
  // splash up instead of flashing Login at a signed-in user.
  authReady: boolean;
  // A one-line explanation shown on Login after a session ends mid-use.
  sessionNotice: string | null;
  signIn: (creds: { email: string; password: string }) => Promise<void>;
  register: (creds: {
    name: string;
    email: string;
    password: string;
  }) => Promise<void>;
  signOut: () => void;
};

const AuthContext = createContext<AuthValue | null>(null);

const OFFLINE_NOTICE =
  "We couldn't connect to AskSight. Check your internet connection and try again.";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [sessionNotice, setSessionNotice] = useState<string | null>(null);

  // Restore a persisted refresh token on cold start. A network failure keeps
  // the token for the next launch; only a rejected token (401/422) clears it.
  useEffect(() => {
    let active = true;

    async function restore() {
      const token = await getRefreshToken();
      if (!token) {
        if (active) setAuthReady(true);
        return;
      }

      try {
        const tokens = await api.refresh(token);
        if (!active) return;
        setAccessToken(tokens.access_token);
        try {
          await setRefreshToken(tokens.refresh_token);
        } catch {
          // Session still works in memory; next cold start asks again.
        }
        const profile = await api.me();
        if (active) setUser(profile);
      } catch (cause) {
        if (!active) return;
        if (
          cause instanceof api.ApiError &&
          (cause.status === 401 || cause.status === 422)
        ) {
          await clearRefreshToken();
          setSessionNotice(cause.message);
        } else {
          setSessionNotice(OFFLINE_NOTICE);
        }
      } finally {
        if (active) setAuthReady(true);
      }
    }

    void restore();
    return () => {
      active = false;
    };
  }, []);

  // The API client calls this after a refresh or retry is rejected, so a
  // session that expires mid-use drops cleanly to Login with the reason.
  useEffect(() => {
    api.setSessionExpiredHandler((message) => {
      setUser(null);
      setSessionNotice(message);
    });
    return () => api.setSessionExpiredHandler(null);
  }, []);

  async function signIn(creds: { email: string; password: string }) {
    const tokens = await api.login(creds);
    setAccessToken(tokens.access_token);
    try {
      await setRefreshToken(tokens.refresh_token);
    } catch {
      // A device that cannot persist the token can still use this session.
    }
    try {
      const profile = await api.me();
      setUser(profile);
      setSessionNotice(null);
    } catch (cause) {
      setAccessToken(null);
      void clearRefreshToken();
      throw cause;
    }
  }

  async function register(creds: {
    name: string;
    email: string;
    password: string;
  }) {
    // Signup returns the user but no token, so follow it with a login. If the
    // auto sign-in fails the account already exists — say so instead of
    // letting a retry hit a confusing "already exists" error.
    await api.signup(creds);
    try {
      await signIn({ email: creds.email, password: creds.password });
    } catch {
      throw new Error(
        "Your account was created, but we couldn't sign you in automatically. Please sign in.",
      );
    }
  }

  // Local state clears synchronously so navigation never waits on the network;
  // revoking the token on the server is best-effort.
  function signOut() {
    setUser(null);
    setSessionNotice(null);
    setAccessToken(null);

    void (async () => {
      const token = await getRefreshToken();
      await clearRefreshToken();
      if (!token) return;
      try {
        await api.logout(token);
      } catch {
        // The token is already gone locally; nothing else to do.
      }
    })();
  }

  return (
    <AuthContext.Provider
      value={{ user, authReady, sessionNotice, signIn, register, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
