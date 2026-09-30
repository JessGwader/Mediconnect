const { Server } = require("socket.io");
const { verifyAccessToken } = require("./utils/tokens");
const db = require("./db");

let io = null;

/**
 * Real-time layer for MediConnect. Every socket must present the same JWT
 * access token used for REST calls — there is no separate, weaker auth path
 * for sockets. A disconnected/offline client simply falls back to the
 * existing polling in NotificationBell/Messages/SupportChat, so nothing
 * breaks if a browser blocks websockets.
 */
function initRealtime(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: process.env.CORS_ORIGIN || "http://localhost:5173",
      credentials: true,
    },
  });

  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error("Authentication required."));
      const payload = verifyAccessToken(token);
      socket.user = { id: payload.sub, role: payload.role, name: payload.name };
      next();
    } catch (err) {
      next(new Error("Invalid or expired token."));
    }
  });

  io.on("connection", (socket) => {
    // Every user automatically gets their own private room for direct
    // notifications (appointments, transfers, payments, doctor applications, etc.)
    socket.join(`user:${socket.user.id}`);

    // A client explicitly joins a conversation room only while actually
    // viewing it — and, unlike before, only after we've checked they're
    // really a participant of that conversation, the same rule the REST
    // history endpoint enforces (assertParticipant in conversations.js).
    // Without this, any authenticated socket could join an arbitrary
    // conversation id and silently receive live messages it could never
    // fetch via REST.
    socket.on("join:conversation", async (conversationId) => {
      if (typeof conversationId !== "string") return;
      try {
        const { rows } = await db.query(
          "SELECT patient_id, doctor_id FROM conversations WHERE id = $1",
          [conversationId]
        );
        const conversation = rows[0];
        if (!conversation) return;

        if (socket.user.role === "Administrator") {
          socket.join(`conversation:${conversationId}`);
          return;
        }
        if (socket.user.role === "Patient") {
          const patientRes = await db.query("SELECT id FROM patients WHERE user_id = $1", [socket.user.id]);
          if (patientRes.rows[0]?.id === conversation.patient_id) socket.join(`conversation:${conversationId}`);
          return;
        }
        if (conversation.doctor_id === socket.user.id) socket.join(`conversation:${conversationId}`);
      } catch {
        // Fail closed — an error resolving membership means no join.
      }
    });
    socket.on("leave:conversation", (conversationId) => {
      if (typeof conversationId === "string") socket.leave(`conversation:${conversationId}`);
    });

    // Support-topic rooms follow the same rule as GET /api/support-topics in
    // supportChat.js: any authenticated Patient may join any topic (it's a
    // shared, anonymous peer-support space, not per-topic membership) — but
    // Doctors and Administrators must never be able to join at all.
    socket.on("join:support-topic", (topicId) => {
      if (typeof topicId === "string" && socket.user.role === "Patient") {
        socket.join(`support:${topicId}`);
      }
    });
    socket.on("leave:support-topic", (topicId) => {
      if (typeof topicId === "string") socket.leave(`support:${topicId}`);
    });
  });

  return io;
}

function emitToUser(userId, event, payload) {
  io?.to(`user:${userId}`).emit(event, payload);
}

function emitToConversation(conversationId, event, payload) {
  io?.to(`conversation:${conversationId}`).emit(event, payload);
}

function emitToSupportTopic(topicId, event, payload) {
  io?.to(`support:${topicId}`).emit(event, payload);
}

module.exports = { initRealtime, emitToUser, emitToConversation, emitToSupportTopic };
