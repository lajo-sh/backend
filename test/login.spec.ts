import { describe, test, expect, vi, beforeAll } from "vitest";
import fastify from "../src/app";
import { createSession } from "../src/lib/auth";

beforeAll(() => {
  vi.mock("../src/lib/auth.ts");
  vi.mock("../src/lib/redis.ts");

  vi.mock("bcrypt", () => ({
    default: {
      compare: vi.fn().mockResolvedValue(true),
    },
  }));
});

describe("Login", () => {
  test("POST /auth/login", async () => {
    const res = await fastify.inject({
      method: "POST",
      url: "/auth/login",
      body: {
        email: "test@example.com",
        password: "Password123",
      },
      headers: {
        "Content-Type": "application/json",
      },
    });

    expect(res.json()).toStrictEqual({
      session: expect.any(String),
      success: true,
      email: "test@example.com",
      fullName: "Test User",
    });

    expect(createSession).toHaveBeenCalledOnce();
  });
});
