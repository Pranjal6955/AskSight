import type { ReactNode } from "react";

import { AuthProvider } from "@/lib/auth";
import { SettingsProvider } from "@/lib/settings";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SettingsProvider>
      <AuthProvider>{children}</AuthProvider>
    </SettingsProvider>
  );
}

export const TEST_USER = {
  id: "1",
  name: "John Smith",
  email: "john@example.com",
  createdAt: "2026-01-01T00:00:00Z",
};
