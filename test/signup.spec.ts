import { describe, test, expect, vi, beforeAll } from "vitest";
import fastify from "../src/app";
import { createSession } from "../src/lib/auth";

beforeAll(() => {
  vi.mock("../src/lib/auth.ts");
  vi.mock("../src/lib/redis.ts");
});

describe("Signup", () => {
  test("POST /auth/signup", async () => {
    const res = await fastify.inject({
      method: "POST",
      url: "/auth/signup",
      body: {
        email: "test2@example.com",
        password: "Password123",
        fullName: "Test User",
      },
      headers: {
        "Content-Type": "application/json",
      },
    });

    expect(res.json()).toStrictEqual({
      session: expect.any(String),
      success: true,
      user: {
        email: "test2@example.com",
        fullName: "Test User",
        id: expect.any(Number),
      },
    });

    expect(createSession).toHaveBeenCalledOnce();
  });
});
