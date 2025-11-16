import { io } from "socket.io-client";

export function createSocket(token, user) {
  const base = import.meta.env.VITE_SERVER_URL || import.meta.env.VITE_SOCKET_URL || "http://localhost:5000";
  // include stable user id + name in auth so server can dedupe users reliably
  const socket = io(base, {
    path: "/socket.io",
    auth: { token, userId: user?.id, userName: user?.fullName },
    transports: ["polling", "websocket"],
    autoConnect: false,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
  });

  // Helpful debug listeners (will print in browser console)
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
