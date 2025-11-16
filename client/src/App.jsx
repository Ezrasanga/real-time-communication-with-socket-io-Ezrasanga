import React, { useEffect, useRef, useState, useCallback } from "react";
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

// import socket helper if present; will be used only on manual connect
import { createSocket } from "./socket";

const URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:5000';

// --- UI helper: initials avatar generator ---
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
	// minimal, defensive state to avoid undefined references
	const [messages, setMessages] = useState([]);
	const [onlineUsers, setOnlineUsers] = useState([]);
	const [input, setInput] = useState("");
	const [socketInstance, setSocketInstance] = useState(null);
	const [connectionStatus, setConnectionStatus] = useState("disconnected");
	const [lastError, setLastError] = useState(null);
	const [rooms, setRooms] = useState([]);
	const [currentRoom, setCurrentRoom] = useState("global");
	const messageListRef = useRef(null);
	const typingTimeoutRef = useRef(null);
	const lastTsRef = useRef(Date.now());

	const { user } = useUser() || {};
	const { getToken } = useAuth();

	const appName = import.meta.env.VITE_APP_NAME || "Realtime App";

	// --- Added: ensure messages/input state and refs exist to avoid ReferenceErrors ---
	// --- end added ---

  // Utility: browser notification
  const notify = useCallback((title, opts) => {
    try {
      if (("Notification" in window) && Notification.permission === "granted") {
        new Notification(title, opts);
      }
    } catch (e) {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (("Notification" in window) && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

	// Manual connect to avoid unexpected automatic errors
	const handleConnect = async () => {
		setLastError(null);
		setConnectionStatus("connecting");
		let token = null;
		try {
			token = await getToken();
			console.info("[auth] token present:", !!token, token ? `${String(token).slice(0,8)}...` : "none");
		} catch (e) {
			console.error("[auth] getToken failed:", e);
			setLastError("getToken failed: " + (e?.message || e));
			setConnectionStatus("error");
			return;
		}

		try {
			// determine a stable user payload to send to the server
			const userPayload = {
				id: user?.id, // Clerk user id
				fullName: user?.fullName || user?.firstName || user?.primaryEmailAddress?.emailAddress || "Unknown",
			};
			const s = createSocket(token, userPayload);
			// attach minimal listeners so UI updates
			s.on("connect", () => {
				console.info("[socket] connected", s.id);
				setConnectionStatus("connected");
			});
			s.on("connect_error", (err) => {
				console.error("[socket] connect_error", err && err.message, err);
				setLastError(err?.message || String(err));
				setConnectionStatus("error");
			});
			s.on("disconnect", (reason) => {
				console.info("[socket] disconnected", reason);
				setConnectionStatus("disconnected");
			});
			s.on("users", (users) => {
				console.info("[socket] users", users);
				if (Array.isArray(users)) setOnlineUsers(users);
			});
			s.on("message", (msg) => {
				setMessages((prev) => [...prev, msg]);
			});
			s.on("rooms", (r) => {
				console.info("[socket] rooms:", r);
				setRooms(Array.isArray(r) ? r : []);
			});
			s.on("room_messages", ({ room, messages: roomMsgs }) => {
				console.info("[socket] room_messages", room, roomMsgs?.length);
				if (!Array.isArray(roomMsgs)) return;
				// merge room messages into messages store (dedupe)
				setMessages((prev) => {
					const map = new Map(prev.map((m) => [m.id, m]));
					roomMsgs.forEach((m) => map.set(m.id, m));
					return Array.from(map.values()).sort((a, b) => a.timestamp - b.timestamp);
				});
			});
			s.on("room_users", ({ room, users: ru }) => {
				console.info("[socket] room_users", room, ru);
				// optional: surface per-room users; for now merge into onlineUsers if useful
			});

			s.connect();
			setSocketInstance(s);
		} catch (e) {
			console.error("[socket] create/connect failed", e);
			setLastError(e?.message || String(e));
			setConnectionStatus("error");
		}
	};

	// --- Added: safe sendMessage that guards against undefined/empty input ---
	const sendMessage = useCallback(() => {
		if (!socketInstance) {
			setLastError("Not connected");
			return;
		}
		const text = (input || "").trim();
		if (!text) return;
		socketInstance.emit("message", { room: currentRoom || "global", text }, (ack) => {
			// optional: handle ack
			// console.info("message ack", ack);
		});
		setInput("");
	}, [socketInstance, input, currentRoom]);
	// --- end added ---

  // Typing events (debounced)
  useEffect(() => {
    if (!socketInstance) return;
    socketInstance.emit("typing", { room: "global", isTyping: Boolean(input) });
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socketInstance.emit("typing", { room: "global", isTyping: false });
    }, 1200);
    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
  }, [input, socketInstance]);

  // Load older messages (pagination)
  const loadOlder = () => {
    if (!socketInstance || loadingOlder || !hasMore) return;
    setLoadingOlder(true);
    const beforeTs = messages.length ? messages[0].timestamp : Date.now();
    socketInstance.emit("load_older", { room: "global", beforeTimestamp: beforeTs, limit: 30 }, (res) => {
      if (res?.ok && Array.isArray(res.messages)) {
        setMessages((prev) => {
          const merged = [...res.messages, ...prev];
          // dedupe
          const map = new Map();
          merged.forEach((m) => map.set(m.id, m));
          return Array.from(map.values()).sort((a, b) => a.timestamp - b.timestamp);
        });
        if (res.messages.length < 30) setHasMore(false);
      }
      setLoadingOlder(false);
    });
  };

  // scroll to bottom on new message
  useEffect(() => {
    const el = messageListRef.current;
    if (!el) return;
    // small heuristic: if near bottom, auto-scroll
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 200;
    if (nearBottom) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  // derived count for the header
  const onlineCount = onlineUsers.filter((u) => u.online).length;

	// Add: ensure handleSend exists (called by the Send button)
	const handleSend = () => {
		// socketInstance should be created by handleConnect; guard for absence
		if (!socketInstance) {
			setLastError("Not connected");
			console.warn("[send] abort: no socket instance");
			return;
		}
		const text = (input || "").trim();
		if (!text) return;

		try {
			socketInstance.emit("message", { room: "global", text }, (ack) => {
				// optional: handle server ack
				console.info("[send] ack", ack);
			});
			setInput("");
		} catch (e) {
			console.error("[send] emit failed", e);
			setLastError(e?.message || String(e));
		}
	};

	// Add manualReconnect which safely tears down any existing socket and triggers handleConnect
	const manualReconnect = async () => {
		// If there's an existing socket instance, clean it up first
		if (socketInstance) {
			try {
				socketInstance.removeAllListeners();
				socketInstance.disconnect();
			} catch (e) {
				console.warn("[reconnect] cleanup failed", e);
			}
			setSocketInstance(null);
			setConnectionStatus("disconnected");
		}
		// Call existing connect flow
		try {
			await handleConnect();
		} catch (e) {
			console.error("[reconnect] handleConnect failed", e);
			setLastError(e?.message || String(e));
			setConnectionStatus("error");
		}
	};

	// Create room (prompt or input-based)
	const createRoom = async () => {
		const name = prompt("Room name:");
		if (!name) return;
		socket?.emit("create_room", { name }, (res) => {
			if (res?.ok) {
				setCurrentRoom(name);
				// auto-join newly created room
				socket.emit("join_room", { room: name }, (r) => {
					console.info("joined new room", r);
				});
			} else {
				alert("Failed to create room: " + (res?.error || "unknown"));
			}
		});
	};

	// Join room
	const joinRoom = (room) => {
		if (!socket) {
			alert("Not connected");
			return;
		}
		socket.emit("join_room", { room }, (res) => {
			if (res?.ok) {
				setCurrentRoom(room);
				// room messages will arrive via room_messages handler
			} else {
				console.warn("join_room failed", res);
				alert("Failed to join room: " + (res?.error || "unknown"));
			}
		});
	};

	// Leave room
	const leaveRoom = (room) => {
		if (!socket) return;
		if (room === "global") return alert("Cannot leave global room");
		socket.emit("leave_room", { room }, (res) => {
			if (res?.ok) {
				setCurrentRoom("global");
			} else {
				console.warn("leave_room failed", res);
			}
		});
	};

	// Render messages filtered by currentRoom
	const visibleMessages = messages.filter((m) => (m.room || "global") === (currentRoom || "global"));

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
								<div className="badge" style={{ display: "flex", alignItems: "center", gap: 8 }}>
									<span className={`status-dot ${connectionStatus === "connected" ? "status-connected" : "status-disconnected"}`} />
									<span style={{ color: connectionStatus === "connected" ? "#86efac" : "#fca5a5", fontSize: 13, fontWeight: 600 }}>{connectionStatus}</span>
								</div>
								<button onClick={manualReconnect} className="badge">Reconnect</button>
								<UserButton />
								<SignOutButton className="badge">Sign out</SignOutButton>
							</div>
						</header>

						<div className="layout">
							<aside className="sidebar">
								<div className="users-card">
									<h4>Rooms</h4>
									<div style={{display:'flex', gap:8, marginBottom:8}}>
										<button className="btn btn-primary btn--small" onClick={createRoom}>New Room</button>
										<button className="btn btn-ghost btn--small" onClick={() => joinRoom('global')}>Global</button>
									</div>
									<div className="users-list">
										{rooms.map(r => (
											<div key={r.name} style={{display:'flex', alignItems:'center', gap:8, padding:8, borderRadius:8}}>
												<div style={{fontWeight:700}}>{r.name}</div>
												<div style={{marginLeft:'auto', display:'flex', gap:8}}>
													<button className="btn btn-ghost btn--small" onClick={() => joinRoom(r.name)}>Join</button>
													{currentRoom === r.name && r.name !== 'global' && <button className="btn btn-outline btn--small" onClick={() => leaveRoom(r.name)}>Leave</button>}
												</div>
											</div>
										))}
									</div>
								</div>
							</aside>

							<main className="chat-panel">
								<div className="chat-header">
									<h2 style={{ margin: 0 }}>Global Chat</h2>
									<div style={{ fontSize: 13, color: "var(--muted)" }}>{onlineUsers.filter((u) => u.online).length} online</div>
								</div>

								<div className="chat-card">
									<div className="message-list" ref={messageListRef}>
										{visibleMessages.length === 0 ? (
											<div className="empty">No messages yet</div>
										) : (
											visibleMessages.map((m) => {
												const sent = m.senderId === user?.id || m.senderId === user?.userId;
												return (
													<div key={m.id} className={`message-bubble ${sent ? "message-sent" : "message-recv"}`}>
														<div className="message-meta">
															<div style={{ fontWeight: 700 }}>{m.senderName}</div>
															<div>{m.timestamp ? new Date(m.timestamp).toLocaleTimeString() : ""}</div>
														</div>
														<div>{m.text}</div>
													</div>
												);
											})
										)}
									</div>

									<div className="composer">
										<div className="input-box">
											<input className="input-field" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Type a message..." onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }} />
										</div>
										<button onClick={handleSend} className="send-btn">Send</button>
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
