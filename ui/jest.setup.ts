// jest-expo's built-in SecureStore mock is a no-op that returns undefined, so
// persistence tests would silently pass without ever storing anything.
const mockSecureStore = new Map<string, string>();

jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(
    async (key: string) => mockSecureStore.get(key) ?? null,
  ),
  setItemAsync: jest.fn(async (key: string, value: string) => {
    mockSecureStore.set(key, value);
  }),
  deleteItemAsync: jest.fn(async (key: string) => {
    mockSecureStore.delete(key);
  }),
  getItem: jest.fn((key: string) => mockSecureStore.get(key) ?? null),
  setItem: jest.fn((key: string, value: string) => {
    mockSecureStore.set(key, value);
  }),
  deleteItem: jest.fn((key: string) => {
    mockSecureStore.delete(key);
  }),
}));

beforeEach(() => {
  mockSecureStore.clear();
});
