import ioredis from "ioredis";

/**
 * Parses a Redis URL string into its component parts.
 *
 * @param redisUrl The Redis URL string to parse.
 * @returns An object containing the host, port, username, password, and database number.
 */
function parseRedisUrl(redisUrl: string) {
  const url = new URL(redisUrl);

  return {
    host: url.hostname,
    port: Number(url.port),
    username: url.username,
    password: url.password,
    db: Number(url.pathname.slice(1)),
  };
}

/**
 * Redis client instance.
 */
export const redis = new ioredis({
  ...parseRedisUrl(process.env.REDIS_URL!),
});
