const http = require('http');
const express = require('express');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

/**
 * verifyClerkToken
 *
 * - If CLERK_API_KEY is present and @clerk/clerk-sdk-node is installed,
 *   the function will try to use the SDK to verify the token.
 * - If CLERK_API_KEY is missing, a dev-bypass is returned (useful for local testing).
 * - If verification fails, the function returns null (unauthorized).
 *
 * NOTE: different versions of the Clerk SDK expose different helpers.
 * The code below attempts a couple of common patterns; if your SDK version
 * exposes a different method, replace the logic below with the correct call.
 */
async function verifyClerkToken(token) {
  if (!token) return null;

  // Local dev bypass when CLERK_API_KEY is not set
  if (!process.env.CLERK_API_KEY) {
    console.warn('CLERK_API_KEY not set — skipping Clerk verification (dev bypass). Set CLERK_API_KEY to enable real verification.');
    return { userId: 'dev-user', info: 'dev-bypass' };
  }

  try {
    // dynamic require so server still starts if package not installed
    const clerkSdk = require('@clerk/clerk-sdk-node');

    // Common API surface (attempt a few known shapes)
    // 1) Some versions export clerkClient
    if (clerkSdk.clerkClient && clerkSdk.clerkClient.sessions) {
      // many versions provide clerkClient.sessions.getSession or verifySession
      const sessions = clerkSdk.clerkClient.sessions;
      if (typeof sessions.getSession === 'function') {
        // try getSession (may accept sessionId / token depending on SDK)
        const session = await sessions.getSession({ session: token }).catch(() => null);
        if (session) return { userId: session.userId ?? session.user_id, raw: session };
      }
      if (typeof sessions.verifySession === 'function') {
        const verified = await sessions.verifySession({ token }).catch(() => null);
        if (verified) return { userId: verified.userId ?? verified.user_id, raw: verified };
      }
    }

    // 2) Some versions export a Clerk class / instance with verifyToken-like helpers
    if (typeof clerkSdk.Clerk === 'function') {
      const clerk = new clerkSdk.Clerk({ apiKey: process.env.CLERK_API_KEY });
      if (typeof clerk.verifyToken === 'function') {
        const payload = await clerk.verifyToken(token).catch(() => null);
        if (payload) return { userId: payload.sub ?? payload.user_id, raw: payload };
      }
    }

    // 3) fallback: try any top-level verify function
    if (typeof clerkSdk.verifyToken === 'function') {
      const payload = await clerkSdk.verifyToken(token).catch(() => null);
      if (payload) return { userId: payload.sub ?? payload.user_id, raw: payload };
    }

    // If none matched, throw so we return unauthorized
    throw new Error('Unable to verify token: update verifyClerkToken to use the correct method from your @clerk/clerk-sdk-node version.');
  } catch (err) {
    console.error('Clerk verification error:', err.message || err);
    return null;
  }
}

io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    const verified = await verifyClerkToken(token);
    if (!verified) {
      const err = new Error('unauthorized');
      err.data = { reason: 'invalid token or verification failed' };
      return next(err);
    }
    socket.clerk = verified;
    return next();
  } catch (err) {
    return next(err);
  }
});

io.on('connection', (socket) => {
  console.log('socket connected', socket.id, 'user:', socket.clerk);
  socket.on('ping', (cb) => cb({ ok: true, user: socket.clerk }));
  socket.on('disconnect', () => console.log('disconnected', socket.id));
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`server listening on ${PORT}`));