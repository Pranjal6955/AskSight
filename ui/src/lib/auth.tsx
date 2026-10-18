import { createContext, useContext, useState, type ReactNode } from "react";

import * as api from "./api";
import type { User } from "./api";

type AuthValue = {
  user: User | null;
  signIn: (creds: { email: string; password: string }) => Promise<void>;
  register: (creds: {
    name: string;
    email: string;
    password: string;
  }) => Promise<void>;
  signOut: () => void;
};

const AuthContext = createContext<AuthValue | null>(null);

// ponytail: the backend JWT lives 30 minutes with no refresh endpoint, so the
// session is held in memory and a cold start always returns to /signin. Add
// persistence only once POST /auth/refresh exists to justify it.
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);

  async function signIn(creds: { email: string; password: string }) {
    const { access_token } = await api.login(creds);
    setUser(await api.me(access_token));
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

  return (
    <AuthContext.Provider
      value={{ user, signIn, register, signOut: () => setUser(null) }}
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
