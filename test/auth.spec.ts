import { describe, test, expect, vi, beforeAll } from "vitest";
import { checkSession } from "../src/lib/auth";

vi.mock("../src/lib/redis");

beforeAll(() => {
  process.env.REDIS_URL = "redis://localhost:6379";
});

describe("auth", () => {
  test("checkSession works with Redis cache", async () => {
    const session = await checkSession("session-string");

    expect(session.valid).toBe(true);
  });
});
