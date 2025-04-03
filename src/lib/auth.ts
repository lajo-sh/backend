import type { FastifyReply, FastifyRequest } from "fastify";
import { db } from "../lib/db/db";
import { sessions, type users } from "../lib/db/schema";
import { redis } from "./redis";
import { eq } from "drizzle-orm";
import crypto from "node:crypto";

/**
 * Type representing a user object.
 */
export type UserType = typeof users.$inferSelect;

/**
 * Checks the validity of a session string.
 *
 * @param sessionStr - The session string to validate.
 * @returns An object indicating whether the session is valid and the associated user if valid.
 */
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

/**
 * Creates a new session for a user.
 *
 * @param userId - The ID of the user for whom the session is created.
 * @returns The generated session string.
 */
export async function createSession(userId: number) {
  const sessionString = crypto.randomBytes(32).toString("hex");

  await db.insert(sessions).values({
    userId,
    session: sessionString,
  });

  return sessionString;
}

/**
 * Invalidates a session by removing it from the cache.
 *
 * @param sessionStr - The session string to invalidate.
 */
export async function invalidateSession(sessionStr: string) {
  try {
    await redis.del(`session:${sessionStr}`);
  } catch (error) {
    console.error("Session invalidation error:", error);
  }
}

/**
 * Middleware to authenticate a request based on the session token.
 *
 * @param request - The Fastify request object.
 * @param reply - The Fastify reply object.
 * @returns A response with a 401 status if authentication fails.
 */
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
