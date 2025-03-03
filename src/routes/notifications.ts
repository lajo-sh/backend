import type { FastifyInstance } from "fastify";
import { db } from "../lib/db/db";
import { deviceTokens } from "../lib/db/schema";
import { sendPushNotification } from "../lib/notifications";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { ZodTypeProvider } from "fastify-type-provider-zod";

const RegisterDeviceSchema = z.object({
  token: z.string().nonempty("Device token must not be empty"),
});

const RegisterDeviceResponseSchema = z.object({
  success: z.boolean().optional(),
  error: z.string().optional(),
});

async function routes(fastify: FastifyInstance) {
  fastify.withTypeProvider<ZodTypeProvider>().post(
    "/notifications/register",
    {
      preHandler: fastify.auth([fastify.authenticateHandler]),
      schema: {
        body: RegisterDeviceSchema,
        response: {
          200: RegisterDeviceResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const { token } = request.body;

        const existing = await db
          .select()
          .from(deviceTokens)
          .where(eq(deviceTokens.token, token));

        if (existing.length === 0) {
          await db.insert(deviceTokens).values({
            userId: request.user.id,
            token: token,
            createdAt: new Date().toISOString(),
          });
        }

        return { success: true };
      } catch (error) {
        return { error: "Invalid request body" };
      }
    },
  );
}

export default routes;
