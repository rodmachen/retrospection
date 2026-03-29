import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

function createClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL environment variable is required");
  }
  const sql = postgres(connectionString, { max: 1 });
  return drizzle(sql, { schema });
}

// Singleton for use in serverless functions
let client: ReturnType<typeof createClient> | null = null;

export function getDb() {
  if (!client) {
    client = createClient();
  }
  return client;
}

export type Db = ReturnType<typeof getDb>;
