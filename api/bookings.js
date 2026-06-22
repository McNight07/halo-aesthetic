const { getSql } = require('./_db/client');
const { isValidEmail, missingFields } = require('./_db/validate');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = req.body || {};
  const required = ['name', 'phone', 'email', 'service', 'date', 'time'];
  const missing = missingFields(body, required);
  if (missing.length > 0) {
    return res.status(400).json({ error: `Missing required fields: ${missing.join(', ')}` });
  }
  if (!isValidEmail(body.email)) {
    return res.status(400).json({ error: 'Invalid email address' });
  }

  try {
    const sql = getSql();
    const rows = await sql`
      insert into bookings (name, phone, email, service, preferred_date, preferred_time, notes)
      values (${body.name}, ${body.phone}, ${body.email}, ${body.service}, ${body.date}, ${body.time}, ${body.notes || null})
      returning id
    `;
    return res.status(201).json({ success: true, id: rows[0].id });
  } catch (err) {
    console.error('booking insert failed', err);
    return res.status(500).json({ error: 'Something went wrong saving your booking. Please try again or call us.' });
  }
};
