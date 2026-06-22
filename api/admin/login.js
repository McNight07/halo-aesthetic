const crypto = require('crypto');
const { createSessionToken, setSessionCookie } = require('../_db/admin-auth');

function safeCompare(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { password } = req.body || {};
  if (!password) {
    return res.status(400).json({ error: 'Password is required' });
  }

  if (!process.env.ADMIN_PASSWORD) {
    console.error('ADMIN_PASSWORD is not set');
    return res.status(500).json({ error: 'Admin login is not configured' });
  }

  if (!safeCompare(password, process.env.ADMIN_PASSWORD)) {
    return res.status(401).json({ error: 'Incorrect password' });
  }

  const token = createSessionToken();
  setSessionCookie(res, token);
  return res.status(200).json({ success: true });
};
