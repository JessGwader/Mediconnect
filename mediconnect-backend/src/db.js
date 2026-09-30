const { Pool } = require("pg");

// Single shared connection pool. All queries elsewhere use parameterized
// placeholders ($1, $2, ...) — never string concatenation — to prevent SQL injection.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
});

pool.on("error", (err) => {
  console.error("Unexpected error on idle PostgreSQL client", err);
  process.exit(1);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  getClient: () => pool.connect(), // for multi-statement transactions
  pool,
};
