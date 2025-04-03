import type { FastifyRequest, FastifyReply } from "fastify";
import { vi } from "vitest";

export async function authenticateHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  request.user = {
    id: 1,
    email: "example@example.com",
    password: "hashedpassword",
    fullName: "John Doe",
  };
}

export const createSession = vi.fn().mockResolvedValue("session-token");
