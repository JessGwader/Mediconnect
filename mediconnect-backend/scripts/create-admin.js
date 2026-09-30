// One-off bootstrap script: creates (or promotes) an Administrator account.
// The public /api/auth/register endpoint intentionally never accepts a role
// (see routes/auth.js) — every self-registered account is a Patient, by
// design, so the very first admin has to be created out-of-band, like this.
//
// Usage:
//   node scripts/create-admin.js "Admin Name" admin@example.com "SomeStrongPassw0rd!"
//
// If the email already exists, this promotes that account to Administrator
// and resets its password to the one given (useful if you get locked out).

require("dotenv").config();
const { Pool } = require("pg");
const { hashPassword, isPasswordStrongEnough } = require("../src/utils/password");

async function main() {
  const [name, email, password] = process.argv.slice(2);
  if (!name || !email || !password) {
    console.error('Usage: node scripts/create-admin.js "Admin Name" admin@example.com "SomeStrongPassw0rd!"');
    process.exit(1);
  }
  if (!isPasswordStrongEnough(password)) {
    console.error("Password does not meet the minimum policy (see src/utils/password.js).");
    process.exit(1);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    const passwordHash = await hashPassword(password);
    const { rows } = await client.query(
      `INSERT INTO users (name, email, password_hash, role, status)
       VALUES ($1, $2, $3, 'Administrator', 'Active')
       ON CONFLICT (email)
       DO UPDATE SET role = 'Administrator', status = 'Active',
                      password_hash = EXCLUDED.password_hash, updated_at = now()
       RETURNING id, name, email, role`,
      [name, email.toLowerCase().trim(), passwordHash]
    );
    console.log("Administrator account ready:", rows[0]);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Failed to create admin:", err);
  process.exit(1);
});
