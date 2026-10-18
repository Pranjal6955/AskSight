import { Redirect } from "expo-router";

// Auth state is in-memory only (the backend token lives 30 minutes with no
// refresh endpoint), so a cold start is always signed out.
export default function Index() {
  return <Redirect href="/login" />;
}
