import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

describe("getSessionOptions", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.resetModules();
  });

  it("throws when SESSION_SECRET is missing", async () => {
    delete process.env.SESSION_SECRET;
    const { getSessionOptions } = await import("../session");
    expect(() => getSessionOptions()).toThrow(/SESSION_SECRET/);
  });

  it("throws when SESSION_SECRET is shorter than 32 characters", async () => {
    process.env.SESSION_SECRET = "tooshort";
    const { getSessionOptions } = await import("../session");
    expect(() => getSessionOptions()).toThrow(/32/);
  });

  it("returns valid config when SESSION_SECRET is 32+ characters", async () => {
    process.env.SESSION_SECRET = "a".repeat(32);
    const { getSessionOptions } = await import("../session");
    const opts = getSessionOptions();
    expect(opts.cookieName).toBe("retro_session");
    expect(opts.password).toBe("a".repeat(32));
    expect(opts.cookieOptions?.httpOnly).toBe(true);
    expect(opts.cookieOptions?.sameSite).toBe("lax");
  });

  it("sets secure=true in production", async () => {
    process.env.SESSION_SECRET = "b".repeat(32);
    (process.env as Record<string, string>).NODE_ENV = "production";
    const { getSessionOptions } = await import("../session");
    const opts = getSessionOptions();
    expect(opts.cookieOptions?.secure).toBe(true);
  });

  it("sets secure=false outside production", async () => {
    process.env.SESSION_SECRET = "c".repeat(32);
    (process.env as Record<string, string>).NODE_ENV = "development";
    const { getSessionOptions } = await import("../session");
    const opts = getSessionOptions();
    expect(opts.cookieOptions?.secure).toBe(false);
  });

  it("sets maxAge to 30 days in seconds", async () => {
    process.env.SESSION_SECRET = "d".repeat(32);
    const { getSessionOptions } = await import("../session");
    const opts = getSessionOptions();
    expect(opts.cookieOptions?.maxAge).toBe(60 * 60 * 24 * 30);
  });
});
