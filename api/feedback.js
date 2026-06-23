const { getSql } = require('./_db/client');
const { isNonEmptyString, isValidEmail, missingFields } = require('./_db/validate');

module.exports = async (req, res) => {
  if (req.method === 'GET') {
    try {
      const sql = getSql();
      const rows = await sql`
        select name, message, created_at
        from feedback
        where is_approved = true
        order by created_at desc
        limit 30
      `;
      return res.status(200).json({ feedback: rows });
    } catch (err) {
      console.error('feedback fetch failed', err);
      return res.status(500).json({ error: 'Could not load feedback right now.' });
    }
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = req.body || {};
  const missing = missingFields(body, ['name', 'message']);
  if (missing.length > 0) {
    return res.status(400).json({ error: `Missing required fields: ${missing.join(', ')}` });
  }
  if (body.email && !isValidEmail(body.email)) {
    return res.status(400).json({ error: 'Invalid email address' });
  }

  try {
    const sql = getSql();
    await sql`
      insert into feedback (name, email, message)
      values (${body.name}, ${body.email || null}, ${body.message})
    `;
    return res.status(201).json({ success: true });
  } catch (err) {
    console.error('feedback insert failed', err);
    return res.status(500).json({ error: 'Something went wrong sending your feedback. Please try again.' });
  }
};
