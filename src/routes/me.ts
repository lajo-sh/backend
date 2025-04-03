import type { FastifyInstance } from "fastify";
import { db } from "../lib/db/db";
import { users, trustedUsers } from "../lib/db/schema";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import bcrypt from "bcrypt";
import { redis } from "../lib/redis";

const UpdateUserSchema = z
  .object({
    fullName: z.string().optional(),
    email: z.string().email("Invalid email format").optional(),
    currentPassword: z.string().optional(),
    newPassword: z
      .string()
      .optional()
      .refine((val) => {
        if (!val) return true;
        return (
          val.length >= 8 &&
          /[A-Z]/.test(val) &&
          /[a-z]/.test(val) &&
          /[0-9]/.test(val)
        );
      }, "Password must be at least 8 characters and contain uppercase, lowercase, and numbers"),
  })
  .refine(
    (data) => {
      if (data.currentPassword && !data.newPassword) return false;
      if (!data.currentPassword && data.newPassword) return false;
      return true;
    },
    {
      message:
        "Both current and new password must be provided to change password",
    },
  );

const UserResponseSchema = z.object({
  valid: z.boolean().optional(),
  user: z
    .object({
      id: z.number().optional(),
      email: z.string().email().optional(),
      fullName: z.string().optional().nullable(),
      blockedWebsites: z.number().optional(),
    })
    .optional(),
  error: z.string().optional(),
});

const TrustedUserRequestSchema = z.object({
  email: z.string().email("Invalid email format"),
});

const TrustedUserResponseSchema = z.object({
  success: z.boolean().optional(),
  error: z.string().optional(),
});

const DeleteTrustedUserParamsSchema = z.object({
  id: z.string(),
});

const MeResponse = z.object({
  success: z.boolean(),
  error: z.string().optional(),
  user: z
    .object({
      id: z.number(),
      email: z.string(),
      fullName: z.string(),
      trustedUsers: z
        .array(
          z.object({
            id: z.number(),
            email: z.string(),
            name: z.string(),
          }),
        )
        .optional(),
    })
    .optional(),
});

async function routes(fastify: FastifyInstance) {
  fastify.withTypeProvider<ZodTypeProvider>().post(
    "/auth/me",
    {
      preHandler: fastify.auth([fastify.authenticateHandler]),
      schema: {
        body: UpdateUserSchema,
        response: {
          200: UserResponseSchema,
        },
      },
    },
    async (request) => {
      const data: Partial<typeof users.$inferInsert> = {};

      if (typeof request.body !== "object" || !request.body) {
        return {
          valid: true,
          user: {
            id: request.user.id,
            email: request.user.email,
            fullName: request.user.fullName,
          },
        };
      }

      if ("fullName" in request.body) {
        data.fullName = request.body.fullName;
      }

      if ("email" in request.body) {
        data.email = request.body.email;
      }

      if (request.body.currentPassword && request.body.newPassword) {
        const user = await db
          .select()
          .from(users)
          .where(eq(users.id, request.user.id))
          .limit(1)
          .then((rows) => rows[0]);

        const passwordMatch = await bcrypt.compare(
          request.body.currentPassword,
          user.password,
        );

        if (!passwordMatch) {
          throw new Error("Current password is incorrect");
        }

        const hashedNewPassword = await bcrypt.hash(
          request.body.newPassword,
          10,
        );
        data.password = hashedNewPassword;
      }

      await db.update(users).set(data).where(eq(users.id, request.user.id));

      return {
        valid: true,
        user: {
          id: request.user.id,
          email: request.user.email,
          fullName: request.user.fullName,
        },
      };
    },
  );

  fastify.withTypeProvider<ZodTypeProvider>().get(
    "/auth/me",
    {
      preHandler: fastify.auth([fastify.authenticateHandler]),
      schema: {
        response: {
          200: UserResponseSchema,
        },
      },
    },
    async (request) => {
      return {
        valid: true,
        user: {
          id: request.user.id,
          email: request.user.email,
          fullName: request.user.fullName ?? "",
        },
      };
    },
  );

  fastify.withTypeProvider<ZodTypeProvider>().get(
    "/me/trusted-users",
    {
      preHandler: fastify.auth([fastify.authenticateHandler]),

      schema: {
        response: {
          200: z.object({
            trustedUsers: z.array(
              z.object({
                id: z.string(),
                email: z.string().email("Invalid email format"),
                fullName: z.string(),
              }),
            ),
          }),
        },
      },
    },
    async (request) => {
      const trusted = await db
        .select({
          id: users.id,
          email: users.email,
          fullName: users.fullName,
        })
        .from(trustedUsers)
        .innerJoin(users, eq(users.id, trustedUsers.trustedUserId))
        .where(eq(trustedUsers.userId, request.user.id));

      return {
        trustedUsers: trusted.map((user) => ({
          id: String(user.id),
          email: user.email,
          fullName: user.fullName ?? "",
        })),
      };
    },
  );

  fastify.withTypeProvider<ZodTypeProvider>().post(
    "/me/trusted-users",
    {
      preHandler: fastify.auth([fastify.authenticateHandler]),
      schema: {
        body: TrustedUserRequestSchema,
        response: {
          200: TrustedUserResponseSchema,
        },
      },
    },
    async (request) => {
      const { email } = request.body;

      const [targetUser] = await db
        .select()
        .from(users)
        .where(eq(users.email, email));

      if (!targetUser) {
        return { error: "User not found" };
      }

      const [existing] = await db
        .select()
        .from(trustedUsers)
        .where(
          and(
            eq(trustedUsers.userId, request.user.id),
            eq(trustedUsers.trustedUserId, targetUser.id),
          ),
        );

      if (existing) {
        return { error: "User is already trusted" };
      }

      await db.insert(trustedUsers).values({
        userId: request.user.id,
        trustedUserId: targetUser.id,
        createdAt: new Date().toISOString(),
      });

      await redis.del(`user_data:${request.user.id}`);

      return { success: true };
    },
  );

  fastify.withTypeProvider<ZodTypeProvider>().delete(
    "/me/trusted-users/:id",
    {
      preHandler: fastify.auth([fastify.authenticateHandler]),
      schema: {
        params: DeleteTrustedUserParamsSchema,
        response: {
          200: TrustedUserResponseSchema,
        },
      },
    },
    async (request) => {
      const userId = Number.parseInt(request.params.id, 10);

      await db
        .delete(trustedUsers)
        .where(
          and(
            eq(trustedUsers.userId, request.user.id),
            eq(trustedUsers.trustedUserId, userId),
          ),
        );

      await redis.del(`user_data:${request.user.id}`);

      return { success: true };
    },
  );

  fastify.withTypeProvider<ZodTypeProvider>().get(
    "/me",
    {
      schema: {
        response: {
          200: MeResponse,
        },
      },
      preHandler: fastify.auth([fastify.authenticateHandler]),
    },
    async (request) => {
      try {
        const CACHE_KEY = `user_data:${request.user.id}`;
        const cachedData = await redis.get(CACHE_KEY);

        if (cachedData) {
          return JSON.parse(cachedData);
        }

        const trusted = await db.query.trustedUsers.findMany({
          where: eq(trustedUsers.userId, request.user.id),
          with: {
            trustedUser: true,
          },
        });

        const response = {
          success: true,
          user: {
            ...request.user,
            trustedUsers: trusted.map((t) => ({
              id: t.id || 0,
              email: t.trustedUser.email || "",
              name: t.trustedUser.fullName || "",
            })),
          },
        };

        await redis.set(CACHE_KEY, JSON.stringify(response), "EX", 900);

        return response;
      } catch (error) {
        fastify.log.error("Error fetching user data:", error);
        return {
          success: false,
          error: "Failed to fetch user data",
        };
      }
    },
  );
}

export default routes;
