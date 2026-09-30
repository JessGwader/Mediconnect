import { createContext, useContext, useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { getAccessToken, API_BASE } from "../api/client";
import { useAuth } from "./AuthContext";

const SocketContext = createContext(null);

// Real-time is additive, not load-bearing: every screen that uses this also
// still works off its existing REST polling if the socket never connects
// (blocked by a network policy, briefly disconnected, etc.) — this context
// just makes updates feel instant when it's available.
export function SocketProvider({ children }) {
  const { user } = useAuth();
  const [connected, setConnected] = useState(false);
  const socketRef = useRef(null);

  useEffect(() => {
    if (!user) {
      socketRef.current?.disconnect();
      socketRef.current = null;
      setConnected(false);
      return;
    }
    const socket = io(API_BASE, {
      auth: (cb) => cb({ token: getAccessToken() }),
      withCredentials: true,
      transports: ["websocket", "polling"],
    });
    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));
    socketRef.current = socket;

    return () => { socket.disconnect(); };
  }, [user]);

  return (
    <SocketContext.Provider value={{ socket: socketRef.current, connected }}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  const ctx = useContext(SocketContext);
  if (!ctx) throw new Error("useSocket must be used within SocketProvider");
  return ctx;
}
