const bcrypt = require("bcrypt");

const SALT_ROUNDS = parseInt(process.env.BCRYPT_SALT_ROUNDS || "12", 10);

async function hashPassword(plain) {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

async function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

// Minimum viable password policy — tune to your hospital's security requirements.
function isPasswordStrongEnough(pw) {
  return typeof pw === "string" && pw.length >= 6;
}

module.exports = { hashPassword, verifyPassword, isPasswordStrongEnough };
