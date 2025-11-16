import { io } from "socket.io-client";

export function createSocket(token, user) {
  const base = import.meta.env.VITE_SERVER_URL || import.meta.env.VITE_SOCKET_URL || "http://localhost:5000";
  const socket = io(base, {
    path: "/socket.io",
    auth: { token, userId: user?.id, userName: user?.fullName || user?.name },
    transports: ["polling", "websocket"],
    autoConnect: false,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
  });

  socket.on("connect", () => {
    console.info("[socket] connected", socket.id, "->", base);
  });
  socket.on("connect_error", (err) => {
    console.error("[socket] connect_error", err && err.message, err);
  });
  socket.on("error", (err) => {
    console.error("[socket] error", err);
  });
  socket.on("reconnect_attempt", (n) => {
    console.info("[socket] reconnect attempt", n);
  });

  return socket;
}
