import "dotenv/config";
import fastify from "./app";

fastify.listen(
  {
    port: Number.parseInt(process.env.PORT || "3000"),
    host: process.env.HOST || "0.0.0.0",
  },
  (err, address) => {
    fastify.log.info(`Server listening on ${address}`);

    if (err) {
      fastify.log.error(err);

      process.exit(1);
    }
  },
);
