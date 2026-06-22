const { getSql } = require('../_db/client');
const { isValidEmail, missingFields } = require('../_db/validate');
const {
  hashPassword,
  verifyPassword,
  createSession,
  destroySession,
  setSessionCookie,
  clearSessionCookie,
  getSessionTokenFromRequest,
  logActivity,
  sanitizeUser,
} = require('../_db/auth');

const USERNAME_PATTERN = /^[a-zA-Z0-9_.]{3,30}$/;

async function handleSignup(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = req.body || {};
  const missing = missingFields(body, ['fullName', 'username', 'email', 'password']);
  if (missing.length > 0) {
    return res.status(400).json({ error: `Missing required fields: ${missing.join(', ')}` });
  }
  if (!isValidEmail(body.email)) {
    return res.status(400).json({ error: 'Invalid email address' });
  }
  if (!USERNAME_PATTERN.test(body.username)) {
    return res.status(400).json({ error: 'Username must be 3-30 characters: letters, numbers, underscores, or periods only' });
  }
  if (String(body.password).length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  const sql = getSql();

  try {
    const existing = await sql`select id from users where email = ${body.email} or username = ${body.username}`;
    if (existing.length > 0) {
      return res.status(409).json({ error: 'An account with that email or username already exists' });
    }

    const passwordHash = await hashPassword(body.password);
    const rows = await sql`
      insert into users (full_name, username, email, password_hash)
      values (${body.fullName}, ${body.username}, ${body.email}, ${passwordHash})
      returning *
    `;
    const user = rows[0];

    await sql`insert into notification_preferences (user_id) values (${user.id})`;
    await logActivity(user.id, 'signup');

    const token = await createSession(user.id);
    setSessionCookie(res, token);

    return res.status(201).json({ user: sanitizeUser(user) });
  } catch (err) {
    console.error('signup failed', err);
    return res.status(500).json({ error: 'Something went wrong creating your account. Please try again.' });
  }
}

async function handleLogin(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = req.body || {};
  const missing = missingFields(body, ['email', 'password']);
  if (missing.length > 0) {
    return res.status(400).json({ error: `Missing required fields: ${missing.join(', ')}` });
  }

  try {
    const sql = getSql();
    const rows = await sql`select * from users where email = ${body.email}`;
    const user = rows[0];

    if (!user || !(await verifyPassword(body.password, user.password_hash))) {
      return res.status(401).json({ error: 'Incorrect email or password' });
    }

    const token = await createSession(user.id);
    setSessionCookie(res, token);
    await logActivity(user.id, 'login');

    return res.status(200).json({ user: sanitizeUser(user) });
  } catch (err) {
    console.error('login failed', err);
    return res.status(500).json({ error: 'Something went wrong logging in. Please try again.' });
  }
}

async function handleLogout(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = getSessionTokenFromRequest(req);
  await destroySession(token);
  clearSessionCookie(res);
  return res.status(200).json({ success: true });
}

module.exports = async (req, res) => {
  const action = Array.isArray(req.query.action) ? req.query.action[0] : req.query.action;

  if (action === 'signup') return handleSignup(req, res);
  if (action === 'login') return handleLogin(req, res);
  if (action === 'logout') return handleLogout(req, res);

  return res.status(404).json({ error: 'Not found' });
};
