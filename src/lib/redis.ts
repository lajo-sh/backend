import ioredis from "ioredis";

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

export const redis = new ioredis({
  ...parseRedisUrl(process.env.REDIS_URL!),
});
