import { describe, it, expect } from "vitest";
import { checkBearerToken } from "../../api/auth";

describe("checkBearerToken", () => {
  const apiKey = "secret-key-123";

  it("returns true for valid bearer token", () => {
    expect(checkBearerToken(`Bearer ${apiKey}`, apiKey)).toBe(true);
  });

  it("returns false for missing header", () => {
    expect(checkBearerToken(null, apiKey)).toBe(false);
  });

  it("returns false for wrong key", () => {
    expect(checkBearerToken("Bearer wrong-key", apiKey)).toBe(false);
  });

  it("returns false for malformed header (no Bearer prefix)", () => {
    expect(checkBearerToken(apiKey, apiKey)).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(checkBearerToken("", apiKey)).toBe(false);
  });
});
