import React from "react";
import { createRoot } from "react-dom/client";
import { ClerkProvider } from "@clerk/clerk-react";
import App from "./App";
import "./styles.css";

const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
const serverUrl = import.meta.env.VITE_SERVER_URL || import.meta.env.VITE_SOCKET_URL || "http://localhost:5000";

if (!clerkPubKey) {
	console.warn("VITE_CLERK_PUBLISHABLE_KEY is not set in .env — Clerk auth will not work");
}

// Quick startup diagnostics: log env and check server /health
console.info("[startup] VITE_SERVER_URL=", serverUrl, "VITE_CLERK_PUBLISHABLE_KEY=", !!clerkPubKey);

fetch(`${serverUrl.replace(/\/$/, "")}/health`).then((res) => {
	if (!res.ok) throw new Error(`health check returned ${res.status}`);
	return res.json();
}).then((json) => {
	console.info("[startup] server /health:", json);
}).catch((err) => {
	console.error("[startup] server health check failed:", err.message || err);
});

// Global error handlers for clearer debugging when something fails in the browser
window.addEventListener("error", (ev) => {
	// If a resource (script/link/img) failed to load, the event target will have src/href
	if (ev.target && (ev.target.src || ev.target.href)) {
		console.error("[resource error] failed to load:", ev.target.src || ev.target.href, ev);
	} else {
		console.error("[global error]", ev.message, ev.filename, ev.lineno, ev.colno, ev.error);
	}
});
window.addEventListener("unhandledrejection", (ev) => {
	console.error("[unhandled rejection]", ev.reason);
});

// Simple Error Boundary so UI doesn't go blank on runtime errors
class ErrorBoundary extends React.Component {
	constructor(props) {
		super(props);
		this.state = { error: null, info: null };
	}
	componentDidCatch(error, info) {
		this.setState({ error, info });
		console.error("[ErrorBoundary] error:", error, info);
	}
	render() {
		if (this.state.error) {
			return (
				<div style={{ padding: 24, color: "#fff", background: "#111", minHeight: "100vh" }}>
					<h2>Something went wrong</h2>
					<pre style={{ whiteSpace: "pre-wrap", color: "#fca5a5" }}>{String(this.state.error)}</pre>
					{this.state.info && <details style={{ color: "#9aa4b2" }}><summary>Stack</summary><pre>{this.state.info.componentStack}</pre></details>}
				</div>
			);
		}
		return this.props.children;
	}
}

createRoot(document.getElementById("root")).render(
	<React.StrictMode>
		<ErrorBoundary>
			{/* Wrap the app so Clerk can manage authentication state */}
			<ClerkProvider publishableKey={clerkPubKey}>
				<App />
			</ClerkProvider>
		</ErrorBoundary>
	</React.StrictMode>
);
