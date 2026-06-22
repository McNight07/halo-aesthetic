const { getSql } = require('../_db/client');
const { getSessionUser, verifyPassword, hashPassword, logActivity } = require('../_db/auth');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await getSessionUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Not logged in' });
  }

  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current and new password are required' });
  }
  if (String(newPassword).length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters' });
  }

  try {
    const valid = await verifyPassword(currentPassword, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const sql = getSql();
    const newHash = await hashPassword(newPassword);
    await sql`update users set password_hash = ${newHash} where id = ${user.id}`;
    await logActivity(user.id, 'password_changed');

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('password change failed', err);
    return res.status(500).json({ error: 'Something went wrong changing your password.' });
  }
};
