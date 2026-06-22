const { getSql } = require('./_db/client');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const sql = getSql();
    const rows = await sql`
      select id, category, name, duration, price_cents, display_order, description
      from services
      order by display_order asc
    `;
    return res.status(200).json({ services: rows });
  } catch (err) {
    console.error('services fetch failed', err);
    return res.status(500).json({ error: 'Could not load services right now.' });
  }
};
