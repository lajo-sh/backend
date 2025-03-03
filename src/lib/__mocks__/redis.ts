import redisMock from "ioredis-mock";

export const redis = new redisMock({
  data: {
    "session:session-string": JSON.stringify({
      valid: true,
      user: {
        id: 1,
        email: "",
        fullName: "",
      },
    }),
  },
});
