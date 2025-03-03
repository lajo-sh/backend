import { checkSession } from "../src/lib/auth";

jest.mock("../src/lib/redis");

process.env.REDIS_URL = "redis://localhost:6379";

describe("auth", () => {
  test("checkSession works with Redis cache", async () => {
    const session = await checkSession("session-string");

    expect(session.valid).toBe(true);
  });
});
