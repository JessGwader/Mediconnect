process.env.NODE_ENV = "test";
require("dotenv").config({ path: ".env.test" });

const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

// Runs once before the entire test suite: applies every migration against
// the real test database (see .env.test.example — this must point at a
// database you're fine with being wiped, never dev or prod).
module.exports = async function globalSetup() {
  if (!process.env.DATABASE_URL || !process.env.DATABASE_URL.includes("test")) {
    throw new Error(
      "Refusing to run tests: DATABASE_URL does not look like a test database " +
      "(expected the database name to contain 'test'). Check your .env.test."
    );
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const dir = path.join(__dirname, "..", "..", "migrations");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

  const client = await pool.connect();
  try {
    for (const file of files) {
      const sql = fs.readFileSync(path.join(dir, file), "utf8");
      await client.query(sql);
    }
  } finally {
    client.release();
    await pool.end();
  }
};
