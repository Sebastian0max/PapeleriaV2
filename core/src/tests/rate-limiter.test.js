import { describe, it, expect, afterEach } from "vitest";
import { checkRateLimit, resetRateLimit } from "../services/rate-limiter.js";

afterEach(() => resetRateLimit("test-user"));

describe("rate-limiter", () => {
  it("allows first attempt", () => {
    resetRateLimit("test-user");
    const result = checkRateLimit("test-user");
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it("blocks after 5 attempts", () => {
    resetRateLimit("test-user");
    for (let i = 0; i < 5; i++) checkRateLimit("test-user");
    const result = checkRateLimit("test-user");
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.retryAfter).toBeGreaterThan(0);
  });

  it("resets after calling resetRateLimit", () => {
    resetRateLimit("test-user");
    checkRateLimit("test-user");
    resetRateLimit("test-user");
    const result = checkRateLimit("test-user");
    expect(result.allowed).toBe(true);
  });
});
