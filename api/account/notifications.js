const { getSql } = require('../_db/client');
const { getSessionUser } = require('../_db/auth');

module.exports = async (req, res) => {
  const user = await getSessionUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Not logged in' });
  }

  const sql = getSql();

  if (req.method === 'GET') {
    try {
      const rows = await sql`select * from notification_preferences where user_id = ${user.id}`;
      if (rows.length === 0) {
        await sql`insert into notification_preferences (user_id) values (${user.id})`;
        return res.status(200).json({ preferences: { email_booking_reminders: true, email_marketing: false } });
      }
      return res.status(200).json({ preferences: rows[0] });
    } catch (err) {
      console.error('notifications fetch failed', err);
      return res.status(500).json({ error: 'Could not load notification preferences.' });
    }
  }

  if (req.method === 'PUT') {
    const { emailBookingReminders, emailMarketing } = req.body || {};
    try {
      const rows = await sql`
        insert into notification_preferences (user_id, email_booking_reminders, email_marketing)
        values (${user.id}, ${!!emailBookingReminders}, ${!!emailMarketing})
        on conflict (user_id) do update set
          email_booking_reminders = ${!!emailBookingReminders},
          email_marketing = ${!!emailMarketing}
        returning *
      `;
      return res.status(200).json({ preferences: rows[0] });
    } catch (err) {
      console.error('notifications update failed', err);
      return res.status(500).json({ error: 'Could not save notification preferences.' });
    }
  }

  res.setHeader('Allow', 'GET, PUT');
  return res.status(405).json({ error: 'Method not allowed' });
};
