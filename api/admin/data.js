const { getSql } = require('../_db/client');
const { isAdminAuthenticated } = require('../_db/admin-auth');

module.exports = async (req, res) => {
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
};
