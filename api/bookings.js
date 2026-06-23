const { getSql } = require('./_db/client');
const { isValidEmail, missingFields } = require('./_db/validate');
const { sendBookingEmail } = require('./_db/email');

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

    let clientRows = await sql`select id from clients where email = ${body.email} and phone = ${body.phone}`;
    let clientId;
    if (clientRows.length > 0) {
      clientId = clientRows[0].id;
    } else {
      const inserted = await sql`
        insert into clients (name, email, phone) values (${body.name}, ${body.email}, ${body.phone}) returning id
      `;
      clientId = inserted[0].id;
    }

    const rows = await sql`
      insert into bookings (name, phone, email, service, preferred_date, preferred_time, notes, client_id)
      values (${body.name}, ${body.phone}, ${body.email}, ${body.service}, ${body.date}, ${body.time}, ${body.notes || null}, ${clientId})
      returning id, name, email, service, preferred_date, preferred_time
    `;

    await sendBookingEmail('received', rows[0]);

    return res.status(201).json({ success: true, id: rows[0].id });
  } catch (err) {
    console.error('booking insert failed', err);
    return res.status(500).json({ error: 'Something went wrong saving your booking. Please try again or call us.' });
  }
};
