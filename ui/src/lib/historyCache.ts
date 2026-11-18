import type { HistoryPage } from "@/lib/api";

let cachedPage: HistoryPage | null = null;
const listeners = new Set<() => void>();

export function getCachedHistory() {
  return cachedPage;
}

export function setCachedHistory(page: HistoryPage) {
  cachedPage = page;
  listeners.forEach((listener) => listener());
}

export function removeCachedHistoryEntry(id: string) {
  if (!cachedPage) return;
  cachedPage = {
    ...cachedPage,
    items: cachedPage.items.filter((item) => item.id !== id),
  };
  listeners.forEach((listener) => listener());
}

export function clearCachedHistory() {
  cachedPage = null;
  listeners.forEach((listener) => listener());
}

export function subscribeHistoryCache(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
