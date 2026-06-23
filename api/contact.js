const { getSql } = require('./_db/client');
const { isValidEmail, missingFields } = require('./_db/validate');
const { sendContactNotificationEmail } = require('./_db/email');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = req.body || {};
  const missing = missingFields(body, ['name', 'email', 'message']);
  if (missing.length > 0) {
    return res.status(400).json({ error: `Missing required fields: ${missing.join(', ')}` });
  }
  if (!isValidEmail(body.email)) {
    return res.status(400).json({ error: 'Invalid email address' });
  }

  try {
    const sql = getSql();
    const rows = await sql`
      insert into contact_messages (name, email, phone, message)
      values (${body.name}, ${body.email}, ${body.phone || null}, ${body.message})
      returning id
    `;

    await sendContactNotificationEmail({
      id: rows[0].id,
      name: body.name,
      email: body.email,
      phone: body.phone || null,
      message: body.message,
    });

    return res.status(201).json({ success: true, id: rows[0].id });
  } catch (err) {
    console.error('contact insert failed', err);
    return res.status(500).json({ error: 'Something went wrong sending your message. Please try again or email us directly.' });
  }
};
