import { describe, test, expect, vi, beforeAll } from "vitest";
import fastify from "../src/app";

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
  test("POST /auth/me", async () => {
    const res = await fastify.inject({
      method: "GET",
      url: "/auth/me",
      headers: {
        "Content-Type": "application/json",
      },
    });

    expect(res.json()).toStrictEqual({
      valid: true,
      user: {
        email: "example@example.com",
        fullName: "John Doe",
        id: 1,
      },
    });
  });

  test("GET /me/trusted-users", async () => {
    const res = await fastify.inject({
      method: "GET",
      url: "/me/trusted-users",
      headers: {
        "Content-Type": "application/json",
      },
    });

    expect(res.json()).toStrictEqual({
      trustedUsers: [],
    });
  });
});
