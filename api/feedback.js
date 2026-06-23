const { getSql } = require('./_db/client');
const { isNonEmptyString, isValidEmail, missingFields } = require('./_db/validate');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
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
