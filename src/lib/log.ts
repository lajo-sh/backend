import pino from "pino";

export const logger = pino({
  transport:
    process.env.NODE_ENV === "production"
      ? undefined
      : {
          target: "pino-pretty",
        },
});
