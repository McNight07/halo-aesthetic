const { getSql } = require('../_db/client');
const { getSessionUser, sanitizeUser, logActivity } = require('../_db/auth');

module.exports = async (req, res) => {
  if (req.method !== 'PUT') {
    res.setHeader('Allow', 'PUT');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await getSessionUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Not logged in' });
  }

  const { isPrivate } = req.body || {};
  if (typeof isPrivate !== 'boolean') {
    return res.status(400).json({ error: 'isPrivate must be true or false' });
  }

  try {
    const sql = getSql();
    const rows = await sql`
      update users set is_private = ${isPrivate} where id = ${user.id} returning *
    `;
    await logActivity(user.id, isPrivate ? 'made_profile_private' : 'made_profile_public');
    return res.status(200).json({ user: sanitizeUser(rows[0]) });
  } catch (err) {
    console.error('privacy update failed', err);
    return res.status(500).json({ error: 'Something went wrong updating privacy settings.' });
  }
};
