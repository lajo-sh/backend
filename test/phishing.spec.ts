import { describe, test, expect, vi, beforeAll } from "vitest";
import fastify from "../src/app";

beforeAll(() => {
  vi.mock("../src/lib/auth.ts");
  vi.mock("../src/lib/redis.ts");
});

describe("Phishing related routes", () => {
  test("POST /check-phishing", async () => {
    const res = await fastify.inject({
      method: "POST",
      url: "/check-phishing",
      body: {
        url: "example.com",
      },
      headers: {
        "Content-Type": "application/json",
      },
    });

    expect(res.json()).toStrictEqual({
      success: true,
      isPhishing: false,
      explanation: "Test explanation",
      visitedBefore: true,
      confidence: 0.8,
    });
  });

  test("POST /submit-phishing", async () => {
    const res = await fastify.inject({
      method: "POST",
      url: "/submit-phishing",
      body: {
        url: "example.com",
        isPhishing: true,
        explanation: "Test explanation",
        confidence: 0.9,
      },
      headers: {
        "Content-Type": "application/json",
        "x-api-key": "test-token",
      },
    });

    expect(res.json()).toStrictEqual({
      success: true,
    });
  });

  test("POST /submit-phishing with invalid token", async () => {
    const res = await fastify.inject({
      method: "POST",
      url: "/submit-phishing",
      body: {
        url: "example.com",
        isPhishing: true,
        explanation: "Test explanation",
        confidence: 0.9,
      },
      headers: {
        "Content-Type": "application/json",
        "x-api-key": "invalid-token",
      },
    });

    expect(res.json()).toStrictEqual({
      success: false,
      error: "Unauthorized",
    });
  });
});
