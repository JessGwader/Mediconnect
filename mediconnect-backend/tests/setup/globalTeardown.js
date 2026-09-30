module.exports = async function globalTeardown() {
  // Each test file manages its own pg Pool via src/db.js and closes it in
  // its own afterAll; nothing global to tear down beyond that.
};
