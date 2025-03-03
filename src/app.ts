import autoload from "@fastify/autoload";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import {
  serializerCompiler,
  validatorCompiler,
  ZodTypeProvider,
  jsonSchemaTransform,
} from "fastify-type-provider-zod";

import cors from "@fastify/cors";
import auth from "@fastify/auth";
import swagger from "@fastify/swagger";
import scalar from "@scalar/fastify-api-reference";

import { logger } from "./lib/log";
import { authenticateHandler, checkSession, type UserType } from "./lib/auth";

declare module "fastify" {
  interface FastifyRequest {
    user: UserType;
  }

  interface FastifyInstance {
    authenticateHandler: (
      request: FastifyRequest,
      reply: FastifyReply,
    ) => Promise<void>;
  }
}

const PRODUCTION = process.env.NODE_ENV === "production";

const fastify = Fastify({
  loggerInstance: logger,
});

if (!PRODUCTION) {
  fastify.register(cors, {
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE"],
  });

  fastify.get("/openapi.json", async () => {
    return fastify.swagger();
  });

  fastify.register(swagger, {
    transform: jsonSchemaTransform,
  });

  fastify.register(scalar, {
    routePrefix: "/api-reference",
    configuration: {
      spec: {
        url: "/openapi.json",
      },
    },
  });
}

fastify.setValidatorCompiler(validatorCompiler);
fastify.setSerializerCompiler(serializerCompiler);

fastify.addHook("onRequest", (request, reply, done) => {
  request.log.info(
    {
      url: request.url,
      method: request.method,
    },
    "Incoming request",
  );

  done();
});

fastify.addHook("onError", (request, reply, error, done) => {
  request.log.error(
    {
      url: request.url,
      method: request.method,
      error: error.message,
    },
    "Request error occurred",
  );

  done();
});

fastify.decorate("authenticateHandler", authenticateHandler);

fastify.get("/status", async () => {
  return { status: "ok" };
});

fastify.register(auth);

fastify.register(autoload, {
  dir: `${__dirname}/routes`,
  logLevel: "info",
});

export default fastify;
