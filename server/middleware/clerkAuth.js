const { Clerk } = (() => {
  try {
    return require('@clerk/clerk-sdk-node');
  } catch (e) {
    return {};
  }
})();
const jwtLib = require('jsonwebtoken');

let clerkSdk = null;
try {
  clerkSdk = require('@clerk/clerk-sdk-node');
} catch (e) {
  clerkSdk = null;
}

/**
 * Verify Clerk token using available methods:
 * 1) @clerk/clerk-sdk-node.jwt.verifyJwt (preferred)
 * 2) @clerk/clerk-sdk-node.verifyToken (older SDKs)
 * 3) jsonwebtoken.verify using CLERK_JWT_KEY (PEM public key) with RS256
 * 4) fallback: jwt.decode (INSECURE, dev only)
 */
async function verifyTokenFlexible(token) {
  if (!token) throw new Error('No token provided');

  // 1) Clerk SDK jwt.verifyJwt
  try {
    if (clerkSdk && clerkSdk.jwt && typeof clerkSdk.jwt.verifyJwt === 'function') {
      return await clerkSdk.jwt.verifyJwt(token);
    }
  } catch (err) {
    // continue to other methods
  }

  // 2) older SDK verifyToken
  try {
    if (clerkSdk && typeof clerkSdk.verifyToken === 'function') {
      return await clerkSdk.verifyToken(token);
    }
  } catch (err) {
    // continue
  }

  // 3) Verify using CLERK_JWT_KEY (PEM) with RS256
  try {
    if (process.env.CLERK_JWT_KEY) {
      const verified = jwtLib.verify(token, process.env.CLERK_JWT_KEY, { algorithms: ['RS256'] });
      return verified;
    }
  } catch (err) {
    throw new Error(`JWT verification failed: ${err.message}`);
  }

  // 4) Fallback decode (development only)
  try {
    const decoded = jwtLib.decode(token, { complete: true }) || {};
    console.warn('[clerkAuth] WARNING: token was not fully verified. This is INSECURE and only for local development.');
    return decoded.payload || decoded;
  } catch (err) {
    throw new Error('Failed to decode token');
  }
}

// Express middleware
async function requireClerkAuth(req, res, next) {
  try {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : auth;
    if (!token) return res.status(401).json({ error: 'Missing token' });

    const payload = await verifyTokenFlexible(token);
    req.clerkUser = {
      id: payload.sub,
      email: payload.email,
      username: payload.username || payload.email
    };
    return next();
  } catch (err) {
    console.error('[clerkAuth] express verification failed:', err.message || err);
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// Socket.IO handshake middleware
async function socketAuth(socket, next) {
  try {
    const token = socket.handshake.auth?.token || (socket.handshake.headers?.authorization || '').replace('Bearer ', '');
    if (!token) return next(); // allow anonymous if you want
    const payload = await verifyTokenFlexible(token);
    socket.clerkUser = {
      id: payload.sub,
      email: payload.email,
      username: payload.username || payload.email
    };
    return next();
  } catch (err) {
    console.warn('[clerkAuth] socket verification failed:', err.message || err);
    return next(new Error('Authentication error'));
  }
}

module.exports = { requireClerkAuth, socketAuth };