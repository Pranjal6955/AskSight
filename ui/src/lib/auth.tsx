import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import * as api from "./api";
import type { User } from "./api";
import { clearRefreshToken, getRefreshToken, setRefreshToken } from "./storage";

type Credentials = { email: string; password: string };
type SignupInput = Credentials & { name: string };

type AuthValue = {
  user: User | null;
  accessToken: string | null;
  authReady: boolean;
  withAuth: <T>(operation: (accessToken: string) => Promise<T>) => Promise<T>;
  signIn: (credentials: Credentials) => Promise<void>;
  signUp: (input: SignupInput) => Promise<void>;
  signOut: () => void;
};

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessTokenState] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const accessTokenRef = useRef<string | null>(null);
  const refreshPromiseRef = useRef<Promise<string> | null>(null);

  const setAccessToken = useCallback((token: string | null) => {
    accessTokenRef.current = token;
    setAccessTokenState(token);
  }, []);

  const refreshAccessToken = useCallback((): Promise<string> => {
    if (refreshPromiseRef.current) return refreshPromiseRef.current;

    const refreshPromise = (async () => {
      const refreshToken = await getRefreshToken();
      if (!refreshToken) {
        throw new api.ApiError("Your session ended. Please sign in again.", 401);
      }
      try {
        const tokens = await api.refresh(refreshToken);
        try {
          await setRefreshToken(tokens.refresh_token);
        } catch {
          // Keep the active session in memory when secure storage is unavailable.
        }
        setAccessToken(tokens.access_token);
        return tokens.access_token;
      } catch (cause) {
        if (
          cause instanceof api.ApiError &&
          (cause.status === 401 || cause.status === 422)
        ) {
          setAccessToken(null);
          setUser(null);
          await clearRefreshToken();
        }
        throw cause;
      }
    })();

    refreshPromiseRef.current = refreshPromise;
    const clearRefreshPromise = () => {
      if (refreshPromiseRef.current === refreshPromise) {
        refreshPromiseRef.current = null;
      }
    };
    void refreshPromise.then(clearRefreshPromise, clearRefreshPromise);
    return refreshPromise;
  }, [setAccessToken, setUser]);

  const withAuth = useCallback(
    async <T,>(operation: (token: string) => Promise<T>): Promise<T> => {
      const token = accessTokenRef.current;
      if (!token) {
        throw new api.ApiError("Please sign in to continue.", 401);
      }

      try {
        return await operation(token);
      } catch (cause) {
        if (!(cause instanceof api.ApiError) || cause.status !== 401) throw cause;
        return operation(await refreshAccessToken());
      }
    },
    [refreshAccessToken],
  );

  // Restore a returning user from the refresh token kept in secure storage.
  useEffect(() => {
    let active = true;

    async function restore() {
      const refreshToken = await getRefreshToken();
      if (!refreshToken) {
        if (active) setAuthReady(true);
        return;
      }

      try {
        const tokens = await api.refresh(refreshToken);
        try {
          await setRefreshToken(tokens.refresh_token);
        } catch {
          // The session still works in memory; the next cold start may ask
          // the user to sign in again.
        }

        if (active) setAccessToken(tokens.access_token);
        const profile = await api.me(tokens.access_token);
        if (active) setUser(profile);
      } catch (cause) {
        // Only a rejected token means the session is gone. A network failure
        // keeps the token for the next launch.
        if (
          cause instanceof api.ApiError &&
          (cause.status === 401 || cause.status === 422)
        ) {
          if (active) setAccessToken(null);
          await clearRefreshToken();
        }
      } finally {
        if (active) setAuthReady(true);
      }
    }

    void restore();
    return () => {
      active = false;
    };
  }, [setAccessToken]);

  const signIn = useCallback(async (credentials: Credentials) => {
    const tokens = await api.login(credentials);

    try {
      await setRefreshToken(tokens.refresh_token);
    } catch {
      // A device that cannot persist the token can still use this session.
    }
    setAccessToken(tokens.access_token);

    try {
      const profile = await api.me(tokens.access_token);
      setUser(profile);
    } catch (cause) {
      setAccessToken(null);
      await clearRefreshToken();
      throw cause;
    }
  }, [setAccessToken]);

  const signUp = useCallback(
    async (input: SignupInput) => {
      await api.signup(input);

      try {
        await signIn({ email: input.email, password: input.password });
      } catch {
        throw new Error(
          "Your account was created, but we couldn't sign you in. Please sign in.",
        );
      }
    },
    [signIn],
  );

  const signOut = useCallback(() => {
    setUser(null);
    setAccessToken(null);

    void (async () => {
      const refreshToken = await getRefreshToken();
      await clearRefreshToken();
      if (!refreshToken) return;

      try {
        await api.logout(refreshToken);
      } catch {
        // The token is gone locally; server-side cleanup is best effort.
      }
    })();
  }, [setAccessToken]);

  const value = useMemo(
    () => ({ user, accessToken, authReady, withAuth, signIn, signUp, signOut }),
    [user, accessToken, authReady, withAuth, signIn, signUp, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside <AuthProvider>");
  return context;
}
