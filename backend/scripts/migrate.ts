import "dotenv/config";
import { readFileSync } from "fs";
import { join } from "path";
import { Pool } from "pg";

async function migrate() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  console.log("[migrate] Connecting to database...");
  const client = await pool.connect();

  try {
    const schema = readFileSync(join(__dirname, "../src/db/schema.sql"), "utf8");
    console.log("[migrate] Running schema...");
    await client.query(schema);
    console.log("[migrate] Done.");
  } catch (err) {
    console.error("[migrate] Failed:", err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
