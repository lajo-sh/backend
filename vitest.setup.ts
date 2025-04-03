import { describe, test, expect, vi, beforeAll } from "vitest";
import { users } from "./src/lib/db/schema";
import * as schema from "./src/lib/db/schema";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

process.env.SUBMIT_TOKEN = "test-token";

// Change the mock path to match how it's imported in your tests
vi.mock("./src/lib/db/db", async (importOriginal) => {
  const { db: _, ...rest } =
    await importOriginal<typeof import("./src/lib/db/db.ts")>();

  const { PGlite } = await vi.importActual<
    typeof import("@electric-sql/pglite")
  >("@electric-sql/pglite");
  const { drizzle } =
    await vi.importActual<typeof import("drizzle-orm/pglite")>(
      "drizzle-orm/pglite",
    );

  const { createRequire } =
    await vi.importActual<typeof import("node:module")>("node:module");
  const require = createRequire(import.meta.url);
  const { pushSchema } = require("drizzle-kit/api");

  const client = new PGlite();
  const db = drizzle(client, { schema });

  const { apply } = await pushSchema(schema, db);
  await apply();

  await db.insert(users).values({
    email: "test@example.com",
    fullName: "Test User",
    password: "",
  });

  await db.insert(schema.domains).values({
    domain: "example.com",
    isPhishing: false,
    explanation: "Test explanation",
    confidence: 0.8,
  });

  return { db, ...rest };
});
