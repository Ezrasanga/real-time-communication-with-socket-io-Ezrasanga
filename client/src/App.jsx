import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  SignedIn,
  SignedOut,
  RedirectToSignIn,
  SignInButton,
  SignOutButton,
  UserButton,
  useUser,
  useAuth,
} from "@clerk/clerk-react";
import { createSocket } from "./socket";
import "./styles.css";

// small helper to render initials
function initials(name) {
  if (!name) return "U";
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export default function App() {
  // Clerk
  const { user } = useUser() || {};
  const { getToken } = useAuth();

  // Canonical socket ref + state
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const [lastError, setLastError] = useState(null);

  // App data
  const [rooms, setRooms] = useState([]);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [messages, setMessages] = useState([]);
  const [currentRoom, setCurrentRoom] = useState("global");
  const [input, setInput] = useState("");
  const [onlineCount, setOnlineCount] = useState(0); // new

  const appName = import.meta.env.VITE_APP_NAME || "Realtime App";

  // register socket and attach all handlers in one place
  const registerSocket = useCallback((s) => {
    if (!s) return;
    const prev = socketRef.current;
    if (prev && prev !== s) {
      try { prev.removeAllListeners(); prev.disconnect(); } catch (e) {}
    }
    socketRef.current = s;

    // clear previous listeners defensively
    try {
      s.off && s.off();
    } catch (e) {}

    // Connection lifecycle
    s.on("connect", () => {
      console.info("[app] socket connected", s.id);
      setConnected(true);
      setLastError(null);
      // request a fresh rooms/users snapshot
      try { s.emit("rooms_request", null); } catch (e) {}
    });
    s.on("disconnect", (reason) => {
      console.info("[app] socket disconnected", reason);
      setConnected(false);
    });
    s.on("connect_error", (err) => {
      console.error("[app] socket connect_error", err && err.message);
      setLastError(err?.message || String(err));
      setConnected(false);
    });

    // domain events
    s.on("rooms", (r) => setRooms(Array.isArray(r) ? r : []));
    s.on("users", (u) => {
      setOnlineUsers(Array.isArray(u) ? u : []);
      // keep onlineCount in sync if server didn't send users_count
      try {
        const inferred = Array.isArray(u) ? u.filter(x => x.online).length : 0;
        setOnlineCount(inferred);
      } catch {}
    });
    s.on("recent_messages", (recent) => {
      if (!Array.isArray(recent)) return;
      setMessages((prev) => {
        const map = new Map(prev.map((m) => [m.id, m]));
        recent.forEach((m) => map.set(m.id, m));
        return Array.from(map.values()).sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
      });
    });
    s.on("room_messages", ({ room, messages: roomMsgs }) => {
      if (!Array.isArray(roomMsgs)) return;
      setMessages((prev) => {
        const map = new Map(prev.map((m) => [m.id, m]));
        roomMsgs.forEach((m) => map.set(m.id, m));
        return Array.from(map.values()).sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
      });
    });
    s.on("message", (msg) => {
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev, msg].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
      });
    });
    s.on("private_message", (msg) => {
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev, { ...msg, private: true }].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
      });
      try {
        if (("Notification" in window) && Notification.permission === "granted") {
          new Notification(`PM from ${msg.senderName}`, { body: msg.text });
        }
      } catch {}
    });
    s.on("message_read", ({ messageId, userId }) => {
      setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, readBy: Array.from(new Set([...(m.readBy || []), userId])) } : m)));
    });
    // new: authoritative count from server
    s.on("users_count", (count) => {
      setOnlineCount(Number(count) || 0);
    });

    // ensure server snapshot sent if client asked
    try { s.emit("rooms_request", null); } catch (e) { /* ignore */ }
  }, []);

  // initialize socket when user signs in
  useEffect(() => {
    if (!user) {
      if (socketRef.current) {
        try { socketRef.current.removeAllListeners(); socketRef.current.disconnect(); } catch (e) {}
        socketRef.current = null;
      }
      setConnected(false);
      return;
    }

    let mounted = true;
    (async () => {
      setLastError(null);
      try {
        const token = await getToken().catch(() => null);
        const userPayload = { id: user?.id, fullName: user?.fullName || user?.firstName || user?.primaryEmailAddress?.emailAddress || "User" };
        const s = createSocket(token, userPayload);
        if (!mounted) return;
        registerSocket(s);

        // NEW: ensure the server knows who joined and which room to join
        s.once("connect", () => {
          try {
            const uname = user?.fullName || user?.firstName || user?.primaryEmailAddress?.emailAddress || user?.id || "Anonymous";
            // announce presence (server tracks online users)
            s.emit("join", { username: uname });
            // ensure we join the current room (default 'global')
            s.emit("join_room", { room: currentRoom || "global" });
          } catch (e) {
            console.warn("[app] join emit failed", e);
          }
        });

        s.connect();
      } catch (err) {
        console.error("[app] init socket failed", err);
        setLastError(String(err));
      }
    })();

    return () => { mounted = false; };
  }, [user, getToken, registerSocket /* intentionally not adding currentRoom to avoid re-init loops */]);

  // derive visible messages for current room
  const visibleMessages = messages.filter((m) => (m.room || "global") === (currentRoom || "global"));

  // mark visible messages as read (avoid marking own messages)
  useEffect(() => {
    const s = socketRef.current;
    if (!s || !connected) return;
    const myId = user?.id || user?.userId;
    visibleMessages.forEach((m) => {
      if (!m) return;
      const alreadyRead = Array.isArray(m.readBy) && m.readBy.includes(myId);
      if (!alreadyRead && m.senderId !== myId) {
        try {
          s.emit("mark_read", { messageId: m.id }, (ack) => { if (ack && !ack.ok) console.warn("mark_read ack error", ack); });
        } catch (e) {
          console.warn("mark_read emit failed", e);
        }
      }
    });
  }, [visibleMessages, connected, user]);

  // safe getter
  const getSocket = () => socketRef.current;

  // helper to wait for socket to connect
  const waitForConnect = (s, timeout = 5000) =>
    new Promise((resolve) => {
      if (!s) return resolve(false);
      if (s.connected) return resolve(true);
      let done = false;
      const onConnect = () => {
        if (done) return;
        done = true;
        s.off("connect", onConnect);
        clearTimeout(t);
        resolve(true);
      };
      const t = setTimeout(() => {
        if (done) return;
        done = true;
        try { s.off("connect", onConnect); } catch (e) {}
        resolve(false);
      }, timeout);
      try { s.once("connect", onConnect); } catch (e) { clearTimeout(t); resolve(false); }
    });

  // Create room: ensure socket exists & connected (create if needed), wait for connect, then emit create_room
  const createRoom = async () => {
    const nameRaw = prompt("Room name:");
    const name = nameRaw?.trim();
    if (!name) return;

    let s = getSocket();

    // If no socket, create one (same flow as init): request token and create
    if (!s) {
      try {
        const token = await getToken().catch(() => null);
        const userPayload = { id: user?.id, fullName: user?.fullName || user?.firstName || user?.primaryEmailAddress?.emailAddress || "User" };
        const created = createSocket(token, userPayload);
        registerSocket(created);
        created.connect();
        s = created;
      } catch (err) {
        console.error("[createRoom] failed to create socket:", err);
        return alert("Unable to connect to server");
      }
    }

    // Wait for connection (timeout)
    const ok = await waitForConnect(s, 5000);
    if (!ok) {
      console.error("[createRoom] socket failed to connect in time");
      return alert("Failed to connect to server — try again");
    }

    // Emit create_room and handle ack
    s.emit("create_room", { name }, (res) => {
      console.info("[app] create_room ack", res);
      if (!res) return alert("No response from server");
      if (!res.ok) return alert("Create room failed: " + (res.error || "unknown"));
      // success: switch to the new room
      setCurrentRoom(res.room?.name || name);
      // request fresh rooms snapshot
      try { s.emit("rooms_request", null); } catch (e) {}
    });
  };

  // Join room: ensure connected then emit join_room (similar guarantees)
  const joinRoom = async (room) => {
    if (!room) return;
    let s = getSocket();
    if (!s) {
      try {
        const token = await getToken().catch(() => null);
        const userPayload = { id: user?.id, fullName: user?.fullName || user?.firstName || user?.primaryEmailAddress?.emailAddress || "User" };
        const created = createSocket(token, userPayload);
        registerSocket(created);
        created.connect();
        s = created;
      } catch (err) {
        console.error("[joinRoom] failed to create socket:", err);
        return alert("Unable to connect to server");
      }
    }

    const ok = await waitForConnect(s, 5000);
    if (!ok) {
      console.error("[joinRoom] socket failed to connect in time");
      return alert("Failed to connect to server — try again");
    }

    s.emit("join_room", { room }, (res) => {
      console.info("[app] join_room ack", res);
      if (!res) return alert("No response from server");
      if (!res.ok) return alert("Join failed: " + (res.error || "unknown"));
      setCurrentRoom(room);
      // server will send room_messages via "room_messages" event — UI will receive them via registerSocket handlers
    });
  };

  // Single, canonical sendMessageToRoom implementation (remove duplicates)
  const sendMessageToRoom = React.useCallback(() => {
    const s = getSocket();
    if (!s) {
      setLastError("Not connected");
      return;
    }
    const text = (input || "").trim();
    if (!text) return;

    // send message to the current room with server ack
    try {
      s.emit("message", { room: currentRoom || "global", text }, (ack) => {
        if (ack && !ack.ok) {
          console.warn("message ack error", ack);
        }
      });
    } catch (err) {
      console.error("emit message failed", err);
      setLastError(String(err));
    }

    setInput("");
  }, [input, currentRoom]);

  // UI (kept simple)
  return (
    <>
      <SignedIn>
        <div className="app-shell">
          <div className="container">
            <header className="app-header">
              <div className="brand">
                <div className="logo">RC</div>
                <div className="title">
                  <div className="app-name">{appName}</div>
                  <div className="app-tag">Fast · Secure · Realtime</div>
                </div>
              </div>

              <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
                <div className="badge" title="connection status">
                  <span className={`status-dot ${connected ? "status-connected" : "status-disconnected"}`} />
                  <span style={{ color: connected ? "#86efac" : "#fca5a5", fontSize: 13, fontWeight: 600 }}>
                    {connected ? "connected" : (lastError ? `error: ${lastError}` : "disconnected")}
                  </span>
                </div>

                <button className="badge" onClick={() => { const s = getSocket(); if (s) s.connect(); else alert("Connect will be automatic when signed in."); }}>Connect</button>
                <button className="badge" onClick={() => { const s = getSocket(); if (s) { s.disconnect(); setConnected(false); } }}>Disconnect</button>

                <UserButton />
                <SignOutButton className="badge">Sign out</SignOutButton>
              </div>
            </header>

            <div className="layout">
              <aside className="sidebar">
                <div className="users-card">
                  <h4>Rooms</h4>
                  <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                    <button className="btn btn-primary btn--small" onClick={createRoom}>New Room</button>
                    <button className="btn btn-ghost btn--small" onClick={() => joinRoom("global")}>Global</button>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {rooms.length === 0 ? <div className="empty">No rooms</div> : rooms.map((r) => (
                      <div key={r.name} style={{ display: "flex", alignItems: "center", gap: 8, padding: 8, borderRadius: 8 }}>
                        <div style={{ fontWeight: 700 }}>{r.name}</div>
                        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                          <button className="btn btn-ghost btn--small" onClick={() => joinRoom(r.name)}>Join</button>
                          {currentRoom === r.name && r.name !== "global" && <button className="btn btn-outline btn--small" onClick={() => leaveRoom(r.name)}>Leave</button>}
                        </div>
                      </div>
                    ))}
                  </div>

                  <hr style={{ margin: "12px 0", borderColor: "rgba(255,255,255,0.03)" }} />

                  <h4>Users</h4>
                  <div className="users-list" style={{ marginTop: 8 }}>
                    {onlineUsers.length === 0 ? <div className="empty">No users</div> : onlineUsers.map((u) => (
                      <div className="user-row" key={u.id}>
                        <div className="avatar">{initials(u.name)}</div>
                        <div className="user-meta">
                          <div className="user-name">{u.name}</div>
                          <div className="user-status">{u.online ? "Online" : "Offline"}</div>
                        </div>
                        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                          <button className="btn btn-ghost btn--small" onClick={() => sendPrivateMessage(u.id, u.name)}>PM</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </aside>

              <main className="chat-panel">
                <div className="chat-header">
                  <h2 style={{ margin: 0 }}>{currentRoom === "global" ? "Global Chat" : `Room: ${currentRoom}`}</h2>
                  <div style={{ fontSize: 13, color: "var(--muted)" }}>{onlineCount} online</div>
                </div>

                <div className="chat-card">
                  <div className="message-list" style={{ display: "flex", flexDirection: "column" }}>
                    {visibleMessages.length === 0 ? (
                      <div className="empty">No messages yet</div>
                    ) : (
                      visibleMessages.map((m) => {
                        const sent = m.senderId === user?.id || m.senderId === user?.userId;
                        return (
                          <div key={m.id || Math.random()} className={`message-bubble ${sent ? "message-sent" : "message-recv"}`} style={{ marginBottom: 10 }}>
                            <div className="message-meta">
                              <div style={{ fontWeight: 700 }}>{m.senderName || m.from}</div>
                              <div>{m.timestamp ? new Date(m.timestamp).toLocaleTimeString() : ""}</div>
                            </div>
                            <div>{m.text || m.content}</div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  <div className="composer">
                    <div className="input-box">
                      <input
                        className="input-field"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Type a message..."
                        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessageToRoom(); } }}
                      />
                    </div>
                    <button onClick={sendMessageToRoom} className="send-btn">Send</button>
                  </div>
                </div>
              </main>
            </div>
          </div>
        </div>
      </SignedIn>

      <SignedOut>
        <RedirectToSignIn />
        <div style={{ minHeight: "70vh", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", color: "#e6eef8" }}>
          <h3>Please sign in to access {appName}</h3>
          <p style={{ color: "#9aa4b2" }}>You will be redirected to the secure sign-in flow.</p>
          <SignInButton mode="modal">Sign in</SignInButton>
        </div>
      </SignedOut>
    </>
  );
}
