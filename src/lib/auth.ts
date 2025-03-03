import type { FastifyReply, FastifyRequest } from "fastify";
import { db } from "../lib/db/db";
import { sessions, type users } from "../lib/db/schema";
import { redis } from "./redis";
import { eq } from "drizzle-orm";
import crypto from "node:crypto";

export type UserType = typeof users.$inferSelect;

export async function checkSession(sessionStr: string) {
  try {
    const CACHE_KEY = `session:${sessionStr}`;
    const cachedUser = await redis.get(CACHE_KEY);

    if (cachedUser) {
      const parsed = JSON.parse(cachedUser);
      if (!parsed.valid) {
        return { valid: false };
      }
      return parsed;
    }

    const session = await db.query.sessions.findFirst({
      where: eq(sessions.session, sessionStr),
      with: {
        user: true,
      },
    });

    if (!session?.user) {
      await redis.set(CACHE_KEY, JSON.stringify({ valid: false }), "EX", 3600);

      return { valid: false };
    }

    const response = {
      valid: true,
      user: session.user,
    };

    await redis.set(CACHE_KEY, JSON.stringify(response), "EX", 86400);

    return response;
  } catch (error) {
    console.error("Session check error:", error);
    return { valid: false };
  }
}

export async function createSession(userId: number) {
  const sessionString = crypto.randomBytes(32).toString("hex");

  await db.insert(sessions).values({
    userId,
    session: sessionString,
  });

  return sessionString;
}

export async function invalidateSession(sessionStr: string) {
  try {
    await redis.del(`session:${sessionStr}`);
  } catch (error) {
    console.error("Session invalidation error:", error);
  }
}

export async function authenticateHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  if (!request.headers.authorization) {
    return reply.status(401).send({ error: "Unauthorized" });
  }

  const token = request.headers.authorization.split(" ")[1];
  const session = await checkSession(token);

  console.log(token);

  if (!session.valid || !("user" in session)) {
    return reply.status(401).send({ error: "Unauthorized" });
  }

  request.user = session.user;
}
