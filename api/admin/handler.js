const crypto = require('crypto');
const { getSql } = require('../_db/client');
const { createSessionToken, isAdminAuthenticated, setSessionCookie, clearSessionCookie } = require('../_db/admin-auth');

function safeCompare(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

async function handleLogin(req, res) {
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
}

async function handleLogout(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  clearSessionCookie(res);
  return res.status(200).json({ success: true });
}

async function handleData(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!isAdminAuthenticated(req)) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const sql = getSql();
    const [bookings, messages] = await Promise.all([
      sql`select * from bookings order by created_at desc limit 200`,
      sql`select * from contact_messages order by created_at desc limit 200`,
    ]);
    return res.status(200).json({ bookings, messages });
  } catch (err) {
    console.error('admin data fetch failed', err);
    return res.status(500).json({ error: 'Could not load data right now.' });
  }
}

module.exports = async (req, res) => {
  const action = Array.isArray(req.query.action) ? req.query.action[0] : req.query.action;

  if (action === 'login') return handleLogin(req, res);
  if (action === 'logout') return handleLogout(req, res);
  if (action === 'data') return handleData(req, res);

  return res.status(404).json({ error: 'Not found' });
};
