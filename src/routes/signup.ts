import { eq } from "drizzle-orm";
import { createSession } from "../lib/auth";
import { db } from "../lib/db/db";
import { users } from "../lib/db/schema";
import bcrypt from "bcrypt";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { redis } from "../lib/redis";

const SignupRequest = z.object({
  email: z.string().nonempty("Email must not be empty").email("Invalid email"),
  password: z
    .string()
    .nonempty("Password must not be empty")
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one number"),
  fullName: z.string().min(1, "Name is required"),
});

const SignupResponseSchema = z.object({
  success: z.boolean(),
  error: z.string().nullable().optional(),
  session: z.string().nullable().optional(),
  user: z
    .object({
      id: z.number(),
      email: z.string(),
      fullName: z.string(),
    })
    .nullable()
    .optional(),
});

type SignupRequestType = z.infer<typeof SignupRequest>;

async function routes(fastify: FastifyInstance) {
  fastify.withTypeProvider<ZodTypeProvider>().post(
    "/auth/signup",
    {
      schema: {
        body: SignupRequest,
        response: {
          200: SignupResponseSchema,
        },
      },
    },
    async (request) => {
      const isValid = await SignupRequest.safeParseAsync(request.body);

      if (!isValid.success) {
        return { success: false, error: isValid.error.errors[0].message };
      }

      const { email, password, fullName } = request.body;

      const existingUser = await db
        .select()
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      if (existingUser.length > 0) {
        return {
          success: false,
          error: "Email already registered",
        };
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      const [user] = await db
        .insert(users)
        .values({
          email,
          password: hashedPassword,
          fullName,
        })
        .returning();

      const session = await createSession(user.id);

      const sessionData = {
        valid: true,
        user: {
          id: user.id,
          email: user.email,
          fullName: user.fullName || "",
        },
      };

      await redis.set(
        `session:${session}`,
        JSON.stringify(sessionData),
        "EX",
        86400,
      );

      await redis.set(
        `notifications:${user.id}`,
        JSON.stringify({
          success: true,
          notifications: [],
        }),
        "EX",
        60,
      );

      await redis.set(
        `user_data:${user.id}`,
        JSON.stringify({
          success: true,
          user: {
            ...user,
            trustedUsers: [],
          },
        }),
        "EX",
        900,
      );

      return {
        success: true,
        session,
        user: {
          id: user.id,
          email: user.email,
          fullName: user.fullName || "",
        },
      };
    },
  );
}

export default routes;
