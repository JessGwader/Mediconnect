module.exports = {
  testEnvironment: "node",
  globalSetup: "./tests/setup/globalSetup.js",
  globalTeardown: "./tests/setup/globalTeardown.js",
  testTimeout: 15000, // real DB round-trips, not mocks — needs more than Jest's 5s default
  testPathIgnorePatterns: ["/node_modules/", "/tests/setup/", "/tests/helpers/"],
};
