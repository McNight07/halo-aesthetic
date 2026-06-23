const { getSql } = require('../_db/client');
const { sendCustomClientEmail } = require('../_db/email');
const { buildReminderContent } = require('../_db/reminders');

module.exports = async (req, res) => {
  if (process.env.CRON_SECRET) {
    const auth = req.headers['authorization'];
    if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  const sql = getSql();

  try {
    const settingsRows = await sql`select * from business_settings`;
    const settings = {};
    settingsRows.forEach((row) => { settings[row.key] = row.value; });

    if (settings.reminders && settings.reminders.enabled === false) {
      return res.status(200).json({ skipped: true, reason: 'Reminders are disabled in Settings.' });
    }

    // Atomically claim every booking whose appointment falls 23-25 hours from now
    // and hasn't been reminded yet. Flipping the status here (before sending)
    // means a second cron run can't double-claim the same row.
    const claimed = await sql`
      update bookings
      set reminder_status = 'sent', reminder_sent_at = now()
      where reminder_status = 'scheduled'
        and status in ('confirmed', 'pending')
        and (preferred_date + preferred_time) between (now() + interval '23 hours') and (now() + interval '25 hours')
      returning *
    `;

    let sent = 0;
    let failed = 0;

    for (const booking of claimed) {
      const { subject, body } = buildReminderContent(booking, settings);
      try {
        await sendCustomClientEmail({ to: booking.email, subject, bodyHtml: body });
        await sql`
          insert into client_emails (client_id, booking_id, to_email, subject, body, status)
          values (${booking.client_id || null}, ${booking.id}, ${booking.email}, ${subject}, ${body}, 'sent')
        `;
        sent += 1;
      } catch (err) {
        console.error(`reminder send failed for booking ${booking.id}`, err);
        await sql`update bookings set reminder_status = 'failed' where id = ${booking.id}`;
        await sql`
          insert into client_emails (client_id, booking_id, to_email, subject, body, status)
          values (${booking.client_id || null}, ${booking.id}, ${booking.email}, ${subject}, ${body}, 'failed')
        `;
        failed += 1;
      }
    }

    return res.status(200).json({ claimed: claimed.length, sent, failed });
  } catch (err) {
    console.error('reminder cron failed', err);
    return res.status(500).json({ error: 'Reminder cron failed.' });
  }
};
