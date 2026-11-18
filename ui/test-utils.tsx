import { useEffect, useRef, type ReactNode } from "react";

import * as api from "@/lib/api";
import { AuthProvider, useAuth } from "@/lib/auth";
import { SettingsProvider } from "@/lib/settings";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SettingsProvider>
      <AuthProvider>{children}</AuthProvider>
    </SettingsProvider>
  );
}

function SignInOnMount({ children }: { children: ReactNode }) {
  const { signIn } = useAuth();
  const signInRef = useRef(signIn);

  useEffect(() => {
    void signInRef.current({
      email: TEST_USER.email,
      password: "test-password",
    });
  }, []);

  return children;
}

// Mock api.login and api.me before rendering this helper to mount a genuinely
// signed-in AuthProvider without repeating the sign-in bootstrap in each test.
export function SignedInProviders({ children }: { children: ReactNode }) {
  return (
    <Providers>
      <SignInOnMount>{children}</SignInOnMount>
    </Providers>
  );
}

export const TEST_USER = {
  id: "1",
  name: "John Smith",
  email: "john@example.com",
  createdAt: "2026-01-01T00:00:00Z",
};

const TEST_TOKENS = {
  access_token: "test-access-token",
  refresh_token: "test-refresh-token",
  token_type: "bearer",
};

export function createFakeApi() {
  return {
    signup: jest
      .fn<ReturnType<typeof api.signup>, Parameters<typeof api.signup>>()
      .mockResolvedValue(TEST_USER),
    login: jest
      .fn<ReturnType<typeof api.login>, Parameters<typeof api.login>>()
      .mockResolvedValue(TEST_TOKENS),
    me: jest
      .fn<ReturnType<typeof api.me>, Parameters<typeof api.me>>()
      .mockResolvedValue(TEST_USER),
    refresh: jest
      .fn<ReturnType<typeof api.refresh>, Parameters<typeof api.refresh>>()
      .mockResolvedValue(TEST_TOKENS),
    logout: jest
      .fn<ReturnType<typeof api.logout>, Parameters<typeof api.logout>>()
      .mockResolvedValue(undefined),
    uploadImage: jest
      .fn<
        ReturnType<typeof api.uploadImage>,
        Parameters<typeof api.uploadImage>
      >()
      .mockResolvedValue({
        id: "test-image",
        mime_type: "image/jpeg",
        size_bytes: 100,
        width: 20,
        height: 20,
        created_at: "2026-01-01T00:00:00Z",
      }),
    getImage: jest.fn<
      ReturnType<typeof api.getImage>,
      Parameters<typeof api.getImage>
    >(),
    ask: jest.fn<ReturnType<typeof api.ask>, Parameters<typeof api.ask>>(),
    transcribe: jest.fn<
      ReturnType<typeof api.transcribe>,
      Parameters<typeof api.transcribe>
    >(),
    synthesize: jest.fn<
      ReturnType<typeof api.synthesize>,
      Parameters<typeof api.synthesize>
    >(),
    listHistory: jest.fn<
      ReturnType<typeof api.listHistory>,
      Parameters<typeof api.listHistory>
    >(),
    getHistoryEntry: jest.fn<
      ReturnType<typeof api.getHistoryEntry>,
      Parameters<typeof api.getHistoryEntry>
    >(),
    deleteHistoryEntry: jest.fn<
      ReturnType<typeof api.deleteHistoryEntry>,
      Parameters<typeof api.deleteHistoryEntry>
    >(),
    deleteAllHistory: jest.fn<
      ReturnType<typeof api.deleteAllHistory>,
      Parameters<typeof api.deleteAllHistory>
    >(),
    deleteImage: jest.fn<
      ReturnType<typeof api.deleteImage>,
      Parameters<typeof api.deleteImage>
    >(),
  };
}
