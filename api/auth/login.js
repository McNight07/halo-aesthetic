const { getSql } = require('../_db/client');
const { missingFields } = require('../_db/validate');
const { verifyPassword, createSession, setSessionCookie, logActivity, sanitizeUser } = require('../_db/auth');

module.exports = async (req, res) => {
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
};
