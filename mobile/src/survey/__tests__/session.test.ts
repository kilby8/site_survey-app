const secure: Record<string, string> = {};
const plain: Record<string, string> = {};

jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(async (k: string) => secure[k] ?? null),
  setItemAsync: jest.fn(async (k: string, v: string) => { secure[k] = v; }),
  deleteItemAsync: jest.fn(async (k: string) => { delete secure[k]; }),
}));
jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn(async (k: string) => plain[k] ?? null),
  setItem: jest.fn(async (k: string, v: string) => { plain[k] = v; }),
  multiRemove: jest.fn(async (ks: string[]) => { ks.forEach((k) => delete plain[k]); }),
}));

import {
  __resetSessionForTests,
  getAccessToken,
  getRefreshToken,
  refreshOnce,
  saveTokens,
  SessionExpiredError,
} from "../../api/session";

beforeEach(() => {
  for (const k of Object.keys(secure)) delete secure[k];
  for (const k of Object.keys(plain)) delete plain[k];
  __resetSessionForTests();
});

describe("session", () => {
  it("moves tokens from AsyncStorage into SecureStore once", async () => {
    plain["site-survey.auth.token.v2"] = "old-access";
    plain["site-survey.auth.refresh-token.v1"] = "old-refresh";
    await expect(getAccessToken()).resolves.toBe("old-access");
    await expect(getRefreshToken()).resolves.toBe("old-refresh");
    expect(plain["site-survey.auth.token.v2"]).toBeUndefined();
    expect(secure["site-survey.auth.access"]).toBe("old-access");
  });

  it("shares one refresh between concurrent callers", async () => {
    await saveTokens("a1", "r1");
    const exchange = jest.fn(async (r: string) => {
      await new Promise((res) => setTimeout(res, 10));
      return { token: `a-from-${r}`, refreshToken: "r2" };
    });
    const [x, y, z] = await Promise.all([refreshOnce(exchange), refreshOnce(exchange), refreshOnce(exchange)]);
    expect(exchange).toHaveBeenCalledTimes(1);
    expect([x, y, z]).toEqual(["a-from-r1", "a-from-r1", "a-from-r1"]);
    await expect(getRefreshToken()).resolves.toBe("r2");
  });

  it("signs out on a revoked refresh token, but not on a network error", async () => {
    await saveTokens("a1", "r1");
    await expect(refreshOnce(async () => { throw new Error("Network request failed"); })).rejects.toThrow("Network");
    await expect(getRefreshToken()).resolves.toBe("r1");

    await expect(refreshOnce(async () => { throw new Error("Invalid refresh token"); })).rejects.toBeInstanceOf(SessionExpiredError);
    await expect(getAccessToken()).resolves.toBeNull();
  });
});
