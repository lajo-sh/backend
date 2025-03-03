import { db } from "../lib/db/db";
import { domains, trustedUsers, blockedPhishingEvents } from "../lib/db/schema";
import { redis } from "../lib/redis";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import axios from "axios";
import { sendPushNotification } from "../lib/notifications";
import { z } from "zod";
import type { ZodTypeProvider } from "fastify-type-provider-zod";

const CheckPhishingRequest = z.object({
  url: z.string().nonempty("URL must not be empty"),
});

const CheckPhishingResponse = z.object({
  success: z.boolean(),
  error: z.string().optional(),
  isPhishing: z.boolean().optional(),
  code: z.string().optional(),
  explanation: z.string().optional(),
  visitedBefore: z.boolean().optional(),
});

const SubmitPhishingRequest = z.object({
  url: z.string().nonempty("URL must not be empty"),
  isPhishing: z.boolean(),
  explanation: z.string().optional(),
});

const SubmitPhishingResponse = z.object({
  success: z.boolean(),
  error: z.string().optional(),
});

const BlockedPhishingResponse = z.object({
  success: z.boolean(),
  error: z.string().optional(),
  data: z
    .array(
      z.object({
        id: z.number(),
        userId: z.number(),
        url: z.string(),
        domain: z.string(),
        timestamp: z.string(),
      }),
    )
    .optional(),
});

function generateSixDigitCode() {
  const randomNumber = Math.floor(Math.random() * 1000000);

  return randomNumber.toString().padStart(6, "0");
}

function normalize(url: string) {
  return url.replace(/(^\w+:|^)\/\//, "").replace(/\/+$/, "");
}

async function routes(fastify: FastifyInstance) {
  fastify.withTypeProvider<ZodTypeProvider>().post(
    "/check-phishing",
    {
      schema: {
        body: CheckPhishingRequest,
        response: {
          200: CheckPhishingResponse,
        },
      },
      preHandler: fastify.auth([fastify.authenticateHandler]),
    },
    async (request, reply) => {
      const { url } = request.body;
      const domain = normalize(url);
      const code = generateSixDigitCode();

      try {
        const CACHE_KEY = `phishing:url:${url}`;
        const cachedResultString = await redis.get(CACHE_KEY);

        if (cachedResultString) {
          try {
            const cachedResult = JSON.parse(cachedResultString);
            const isPhishing = cachedResult.isPhishing;
            let responseCode: string | undefined;

            if (isPhishing) {
              await db.insert(blockedPhishingEvents).values({
                userId: request.user.id,
                url,
                domain,
              });

              const trustedPeople = await db
                .select({
                  userId: trustedUsers.trustedUserId,
                })
                .from(trustedUsers)
                .where(eq(trustedUsers.userId, request.user.id));

              for (const person of trustedPeople) {
                await sendPushNotification(
                  person.userId,
                  "Phishing Alert",
                  "A trusted contact was prevented from accessing a phishing website",
                  {
                    url,
                    code,
                  },
                );
              }

              responseCode = code;
              await redis.set(`phishing:code:${code}`, url, "EX", 60 * 5);
            }

            return {
              success: true,
              isPhishing,
              code: responseCode,
            };
          } catch (e) {
            return { success: false, error: "Invalid cache data" };
          }
        }

        let responseCode: string | undefined;

        const domainInDb = await db.query.domains.findFirst({
          where: eq(domains.domain, domain),
        });

        if (!domainInDb) {
          await axios.post(
            `${process.env.SCRAPER_SERVER_URL}/add-url`,
            {
              url,
            },
            {
              headers: {
                "x-api-key": process.env.SCRAPER_SERVER_API_KEY,
              },
            },
          );

          return { success: true, isPhishing: false, visitedBefore: false };
        }

        const isPhishing = domainInDb.isPhishing;
        const explanation = domainInDb.explanation;

        await redis.set(
          CACHE_KEY,
          JSON.stringify({
            isPhishing,
          }),
          "EX",
          60 * 60 * 24,
        );

        if (isPhishing) {
          await db.insert(blockedPhishingEvents).values({
            userId: request.user.id,
            url,
            domain,
          });

          const trustedPeople = await db
            .select({
              userId: trustedUsers.trustedUserId,
            })
            .from(trustedUsers)
            .where(eq(trustedUsers.userId, request.user.id));

          for (const person of trustedPeople) {
            await sendPushNotification(
              person.userId,
              "Phishing Alert",
              "A trusted contact was prevented from accessing a phishing website",
              {
                url,
                code,
              },
            );
          }

          responseCode = code;
          await redis.set(`phishing:code:${code}`, url, "EX", 60 * 5);
        }

        return {
          success: true,
          isPhishing,
          code: responseCode,
          visitedBefore: true,
          explanation,
        };
      } catch (error) {
        return { success: false, error: "Failed to check URL" };
      }
    },
  );

  fastify.withTypeProvider<ZodTypeProvider>().post(
    "/submit-phishing",
    {
      schema: {
        body: SubmitPhishingRequest,
        response: {
          200: SubmitPhishingResponse,
        },
      },
    },
    async (request, reply) => {
      const authHeader = request.headers["x-api-key"];

      if (authHeader !== process.env.SUBMIT_TOKEN) {
        return {
          success: false,
          error: "Unauthorized",
        };
      }

      const { url, isPhishing, explanation } = request.body;
      const domain = normalize(url);

      try {
        const [existing] = await db
          .select()
          .from(domains)
          .where(eq(domains.domain, domain));

        if (existing) {
          await db.delete(domains).where(eq(domains.domain, domain));
        }

        await db.insert(domains).values({
          domain,
          isPhishing,
          explanation: explanation ?? "",
        });

        const CACHE_KEY = `phishing:url:${url}`;
        const cacheData = {
          isPhishing,
          explanation,
        };
        await redis.set(CACHE_KEY, JSON.stringify(cacheData), "EX", 3600);

        return { success: true };
      } catch (error) {
        fastify.log.error("Error submitting phishing data:", {
          error,
          url,
          isPhishing,
          explanation,
        });

        try {
          const CACHE_KEY = `phishing:url:${url}`;
          const cacheData = {
            isPhishing,
            explanation,
          };
          await redis.set(CACHE_KEY, JSON.stringify(cacheData), "EX", 3600);
        } catch (redisError) {
          fastify.log.error("Redis cache update error:", redisError);
        }

        return {
          success: false,
          error: "Failed to submit phishing data",
        };
      }
    },
  );

  fastify.withTypeProvider<ZodTypeProvider>().get(
    "/blocked-phishing",
    {
      preHandler: fastify.auth([fastify.authenticateHandler]),
      schema: {
        response: {
          200: BlockedPhishingResponse,
        },
      },
    },
    async (request, reply) => {
      try {
        const CACHE_KEY = `blocked_phishing:${request.user.id}`;
        const cachedData = await redis.get(CACHE_KEY);

        if (cachedData) {
          return JSON.parse(cachedData);
        }

        const blockedEvents = await db
          .select()
          .from(blockedPhishingEvents)
          .where(eq(blockedPhishingEvents.userId, request.user.id))
          .orderBy(blockedPhishingEvents.timestamp);

        const response = {
          success: true,
          data: blockedEvents.map((event) => ({
            ...event,
            timestamp: event.timestamp.toISOString(),
          })),
        };

        await redis.set(CACHE_KEY, JSON.stringify(response), "EX", 300);

        return response;
      } catch (error) {
        fastify.log.error("Error fetching phishing history:", error);
        return {
          success: false,
          error: "Failed to fetch phishing history",
        };
      }
    },
  );
}

export default routes;
