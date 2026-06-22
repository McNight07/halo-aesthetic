const crypto = require('crypto');

const SESSION_TTL_MS = 1000 * 60 * 60 * 12; // 12 hours
const COOKIE_NAME = 'admin_session';

function getSecret() {
  if (!process.env.ADMIN_SESSION_SECRET) {
    throw new Error('ADMIN_SESSION_SECRET is not set');
  }
  return process.env.ADMIN_SESSION_SECRET;
}

function sign(value) {
  return crypto.createHmac('sha256', getSecret()).update(value).digest('hex');
}

function createSessionToken() {
  const expires = Date.now() + SESSION_TTL_MS;
  const payload = `admin:${expires}`;
  const signature = sign(payload);
  return `${payload}:${signature}`;
}

function isValidSessionToken(token) {
  if (!token) return false;
  const parts = token.split(':');
  if (parts.length !== 3) return false;
  const [label, expiresStr, signature] = parts;
  const payload = `${label}:${expiresStr}`;
  const expectedSignature = sign(payload);

  const sigBuffer = Buffer.from(signature, 'hex');
  const expectedBuffer = Buffer.from(expectedSignature, 'hex');
  if (sigBuffer.length !== expectedBuffer.length) return false;
  if (!crypto.timingSafeEqual(sigBuffer, expectedBuffer)) return false;

  const expires = parseInt(expiresStr, 10);
  if (Number.isNaN(expires) || Date.now() > expires) return false;

  return label === 'admin';
}

function parseCookies(req) {
  const header = req.headers.cookie || '';
  const cookies = {};
  header.split(';').forEach((pair) => {
    const [key, ...rest] = pair.trim().split('=');
    if (key) cookies[key] = decodeURIComponent(rest.join('='));
  });
  return cookies;
}

function isAdminAuthenticated(req) {
  const cookies = parseCookies(req);
  return isValidSessionToken(cookies[COOKIE_NAME]);
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

module.exports = {
  createSessionToken,
  isAdminAuthenticated,
  setSessionCookie,
  clearSessionCookie,
};
