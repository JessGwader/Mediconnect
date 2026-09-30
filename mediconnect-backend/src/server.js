const http = require("http");
const app = require("./app");
const { initRealtime } = require("./realtime");

const PORT = process.env.PORT || 4000;

// A plain http.Server wraps the Express app so Socket.IO can attach to the
// same port — REST and real-time share one server process, one listener.
const httpServer = http.createServer(app);
initRealtime(httpServer);

httpServer.listen(PORT, () => {
  console.log(`MediConnect API + real-time listening on port ${PORT} (${process.env.NODE_ENV || "development"})`);
});
