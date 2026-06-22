const { getSql } = require('../_db/client');
const { getSessionUser } = require('../_db/auth');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await getSessionUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Not logged in' });
  }

  try {
    const sql = getSql();
    const rows = await sql`
      select action, created_at from activity_log
      where user_id = ${user.id}
      order by created_at desc
      limit 50
    `;
    return res.status(200).json({ activity: rows });
  } catch (err) {
    console.error('activity fetch failed', err);
    return res.status(500).json({ error: 'Could not load activity history.' });
  }
};
