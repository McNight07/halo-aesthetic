const { getSql } = require('./_db/client');
const { isNonEmptyString } = require('./_db/validate');

module.exports = async (req, res) => {
  if (req.method === 'GET') {
    try {
      const sql = getSql();
      const rows = await sql`
        select client_name, rating, comment, created_at
        from reviews
        where is_approved = true
        order by created_at desc
        limit 6
      `;
      return res.status(200).json({ reviews: rows });
    } catch (err) {
      console.error('reviews fetch failed', err);
      return res.status(500).json({ error: 'Could not load reviews right now.' });
    }
  }

  if (req.method === 'POST') {
    const body = req.body || {};
    if (!isNonEmptyString(body.clientName) || !isNonEmptyString(body.comment)) {
      return res.status(400).json({ error: 'Name and comment are required' });
    }
    const rating = parseInt(body.rating, 10);
    if (Number.isNaN(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Rating must be between 1 and 5' });
    }

    try {
      const sql = getSql();
      await sql`
        insert into reviews (client_name, rating, comment)
        values (${body.clientName}, ${rating}, ${body.comment})
      `;
      return res.status(201).json({ success: true });
    } catch (err) {
      console.error('review insert failed', err);
      return res.status(500).json({ error: 'Something went wrong submitting your review.' });
    }
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
};
