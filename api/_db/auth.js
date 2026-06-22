const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { getSql } = require('./client');

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days
const COOKIE_NAME = 'halo_session';

function parseCookies(req) {
  const header = req.headers.cookie || '';
  const cookies = {};
  header.split(';').forEach((pair) => {
    const [key, ...rest] = pair.trim().split('=');
    if (key) cookies[key] = decodeURIComponent(rest.join('='));
  });
  return cookies;
}

async function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

async function verifyPassword(password, hash) {
  if (!hash) return false;
  return bcrypt.compare(password, hash);
}

async function createSession(userId) {
  const sql = getSql();
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await sql`insert into sessions (id, user_id, expires_at) values (${token}, ${userId}, ${expiresAt})`;
  return token;
}

async function destroySession(token) {
  if (!token) return;
  const sql = getSql();
  await sql`delete from sessions where id = ${token}`;
}

async function getSessionUser(req) {
  const cookies = parseCookies(req);
  const token = cookies[COOKIE_NAME];
  if (!token) return null;

  const sql = getSql();
  const rows = await sql`
    select u.* from sessions s
    join users u on u.id = s.user_id
    where s.id = ${token} and s.expires_at > now()
  `;
  return rows[0] || null;
}

function setSessionCookie(res, token) {
  const isProd = process.env.NODE_ENV === 'production';
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
  ];
  if (isProd) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; Max-Age=0`);
}

function getSessionTokenFromRequest(req) {
  return parseCookies(req)[COOKIE_NAME];
}

async function logActivity(userId, action) {
  const sql = getSql();
  await sql`insert into activity_log (user_id, action) values (${userId}, ${action})`;
}

function sanitizeUser(user) {
  if (!user) return null;
  const { password_hash, google_id, ...safe } = user;
  return safe;
}

module.exports = {
  hashPassword,
  verifyPassword,
  createSession,
  destroySession,
  getSessionUser,
  setSessionCookie,
  clearSessionCookie,
  getSessionTokenFromRequest,
  logActivity,
  sanitizeUser,
};
