import { createSession } from "../lib/auth";
import { db } from "../lib/db/db";
import { users } from "../lib/db/schema";
import bcrypt from "bcrypt";
import { eq } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { redis } from "../lib/redis";

const LoginRequest = z.object({
  email: z.string().nonempty("Email must not be empty").email("Invalid email"),
  password: z.string().nonempty("Password must not be empty"),
});

const LoginResponseSchema = z.object({
  success: z.boolean(),
  error: z.string().optional(),
  session: z.string().optional(),
  fullName: z.string().nullable().optional(),
  email: z.string().email().optional(),
});

type LoginRequestType = z.infer<typeof LoginRequest>;

async function routes(fastify: FastifyInstance) {
  fastify.withTypeProvider<ZodTypeProvider>().post(
    "/auth/login",
    {
      schema: {
        body: LoginRequest,
        response: {
          200: LoginResponseSchema,
        },
      },
    },
    async (
      request: FastifyRequest<{ Body: LoginRequestType }>,
      reply: FastifyReply,
    ) => {
      const isValid = await LoginRequest.safeParseAsync(request.body);

      if (!isValid.success) {
        return {
          success: false,
          error: isValid.error.errors[0].message,
        };
      }

      const { email, password } = isValid.data;

      const user = await db
        .select()
        .from(users)
        .where(eq(users.email, email))
        .limit(1)
        .then((rows) => rows[0]);

      if (!user) {
        return {
          success: false,
          error: "Invalid email or password",
        };
      }

      const passwordMatch = await bcrypt.compare(password, user.password);

      if (!passwordMatch) {
        return {
          success: false,
          error: "Invalid email or password",
        };
      }

      const session = await createSession(user.id);

      const sessionData = {
        valid: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.fullName,
        },
      };

      await redis.set(
        `session:${session}`,
        JSON.stringify(sessionData),
        "EX",
        86400,
      );

      return {
        success: true,
        session,
        fullName: user.fullName,
        email: user.email,
      };
    },
  );
}

export default routes;
