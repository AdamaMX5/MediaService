const jwt = require('jsonwebtoken');
const axios = require('axios');

let publicKey = null;

/**
 * Fetches the JWT public key from the AuthService on startup.
 * Retries up to `retries` times with `delayMs` between attempts.
 */
async function initPublicKey(retries = 5, delayMs = 3000) {
  const url = `${process.env.AUTH_SERVICE_URL}/jwt/public-key`;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await axios.get(url);
      console.log('[auth] AuthService response:', JSON.stringify(response.data));
      // Accept either a raw PEM string or { public_key: "..." } / { publicKey: "..." }
      const key =
        typeof response.data === 'string'
          ? response.data
          : (response.data.public_key || response.data.publicKey);
      if (!key) {
        throw new Error(`Unexpected response format from AuthService: ${JSON.stringify(response.data)}`);
      }
      publicKey = key;
      console.log('JWT public key loaded from AuthService');
      return;
    } catch (err) {
      console.warn(`[auth] Attempt ${attempt}/${retries} to fetch public key failed: ${err.message}`);
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
  }

  throw new Error('Could not fetch JWT public key from AuthService after all retries');
}

/**
 * Express middleware – verifies the Bearer JWT and attaches the decoded
 * payload as req.user.
 */
function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: 'Missing Authorization header' });
  }
  if (!authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Malformed Authorization header — expected: Bearer <token>' });
  }

  if (!publicKey) {
    console.error('[auth] Public key not loaded — cannot verify JWT');
    return res.status(500).json({ error: 'Auth service unavailable' });
  }

  const token = authHeader.slice(7);
  try {
    req.user = jwt.verify(token, publicKey, { algorithms: ['RS256'] });
    next();
  } catch (err) {
    console.error('[auth] JWT verification failed:', err.message);
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = { initPublicKey, authenticate };
