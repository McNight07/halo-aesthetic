const { getSql } = require('../_db/client');
const { getSessionUser, verifyPassword, hashPassword, logActivity, sanitizeUser } = require('../_db/auth');
const { sendBookingEmail, sendAdminBookingModifiedEmail } = require('../_db/email');
const { isValidEmail } = require('../_db/validate');

const EDITABLE_FIELDS = [
  'full_name',
  'phone',
  'date_of_birth',
  'gender',
  'bio',
  'location',
  'education',
  'social_links',
  'photo_url',
];

async function handleMe(req, res, user) {
  if (req.method === 'GET') {
    return res.status(200).json({ user: sanitizeUser(user) });
  }

  if (req.method === 'PUT') {
    const body = req.body || {};
    const sql = getSql();

    try {
      const updates = {};
      EDITABLE_FIELDS.forEach((field) => {
        const camelField = field.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
        if (body[camelField] !== undefined) {
          updates[field] = body[camelField];
        }
      });
      if (Array.isArray(body.skills)) updates.skills = body.skills;
      if (Array.isArray(body.interests)) updates.interests = body.interests;

      const columns = Object.keys(updates);
      if (columns.length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
      }

      const setClause = columns.map((col, i) => `${col} = $${i + 1}`).join(', ');
      const values = columns.map((col) => {
        const value = updates[col];
        return col === 'social_links' ? JSON.stringify(value) : value;
      });
      values.push(user.id);

      const queryText = `update users set ${setClause} where id = $${columns.length + 1} returning *`;
      const rows = await sql(queryText, values);

      await logActivity(user.id, 'profile_update');
      return res.status(200).json({ user: sanitizeUser(rows[0]) });
    } catch (err) {
      console.error('profile update failed', err);
      return res.status(500).json({ error: 'Something went wrong saving your profile.' });
    }
  }

  res.setHeader('Allow', 'GET, PUT');
  return res.status(405).json({ error: 'Method not allowed' });
}

async function handlePrivacy(req, res, user) {
  if (req.method !== 'PUT') {
    res.setHeader('Allow', 'PUT');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { isPrivate } = req.body || {};
  if (typeof isPrivate !== 'boolean') {
    return res.status(400).json({ error: 'isPrivate must be true or false' });
  }

  try {
    const sql = getSql();
    const rows = await sql`update users set is_private = ${isPrivate} where id = ${user.id} returning *`;
    await logActivity(user.id, isPrivate ? 'made_profile_private' : 'made_profile_public');
    return res.status(200).json({ user: sanitizeUser(rows[0]) });
  } catch (err) {
    console.error('privacy update failed', err);
    return res.status(500).json({ error: 'Something went wrong updating privacy settings.' });
  }
}

async function handleNotifications(req, res, user) {
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
}

async function handlePassword(req, res, user) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current and new password are required' });
  }
  if (String(newPassword).length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters' });
  }

  try {
    const valid = await verifyPassword(currentPassword, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const sql = getSql();
    const newHash = await hashPassword(newPassword);
    await sql`update users set password_hash = ${newHash} where id = ${user.id}`;
    await logActivity(user.id, 'password_changed');

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('password change failed', err);
    return res.status(500).json({ error: 'Something went wrong changing your password.' });
  }
}

async function handleActivity(req, res, user) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const sql = getSql();
    const rows = await sql`
      select action, created_at from activity_log
      where user_id = ${user.id}
      order by created_at desc
      limit 50
    `;
    return res.status(200).json({ activity: rows });
  } catch (err) {
    console.error('activity fetch failed', err);
    return res.status(500).json({ error: 'Could not load activity history.' });
  }
}

async function handleEmailHistory(req, res, user) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const sql = getSql();
    const rows = await sql`
      select id, subject, body, status, created_at from client_emails
      where to_email = ${user.email}
      order by created_at desc
      limit 50
    `;
    return res.status(200).json({ emails: rows });
  } catch (err) {
    console.error('email history fetch failed', err);
    return res.status(500).json({ error: 'Could not load your email history.' });
  }
}

function ownsBooking(booking, user) {
  return booking.user_id === user.id || booking.email === user.email;
}

async function handleMyBookings(req, res, user) {
  const sql = getSql();

  if (req.method === 'GET') {
    try {
      const rows = await sql`
        select * from bookings
        where user_id = ${user.id} or email = ${user.email}
        order by created_at desc
        limit 100
      `;
      return res.status(200).json({ bookings: rows });
    } catch (err) {
      console.error('my-bookings fetch failed', err);
      return res.status(500).json({ error: 'Could not load your booking requests.' });
    }
  }

  if (req.method === 'PUT') {
    const { id, name, phone, email, service, date, time, notes } = req.body || {};
    if (!id || !service || !date || !time) {
      return res.status(400).json({ error: 'service, date, and time are required' });
    }
    if (email && !isValidEmail(email)) {
      return res.status(400).json({ error: 'Invalid email address' });
    }

    try {
      const existing = await sql`select * from bookings where id = ${id}`;
      if (existing.length === 0) {
        return res.status(404).json({ error: 'Booking request not found.' });
      }
      const booking = existing[0];
      if (!ownsBooking(booking, user)) {
        return res.status(403).json({ error: 'You can only edit your own booking requests.' });
      }
      if (booking.status !== 'pending') {
        return res.status(400).json({ error: 'Only requests that are still pending review can be edited.' });
      }

      await sql`
        insert into booking_history (booking_id, changed_by, action, snapshot)
        values (${id}, 'client', 'pre_modification_snapshot', ${JSON.stringify(booking)})
      `;

      const rows = await sql`
        update bookings set
          name = coalesce(${name}, name),
          phone = coalesce(${phone}, phone),
          email = coalesce(${email}, email),
          service = ${service},
          preferred_date = ${date},
          preferred_time = ${time},
          notes = ${notes || null},
          status = 'pending',
          needs_review = true,
          last_modified_by = 'client',
          client_modified_at = now(),
          updated_at = now()
        where id = ${id}
        returning *
      `;
      const updated = rows[0];

      await sql`
        insert into booking_history (booking_id, changed_by, action, snapshot)
        values (${id}, 'client', 'modified', ${JSON.stringify(updated)})
      `;

      if (updated.client_id && (name || phone || email)) {
        await sql`
          update clients set
            name = coalesce(${name}, name),
            phone = coalesce(${phone}, phone),
            email = coalesce(${email}, email)
          where id = ${updated.client_id}
        `;
      }

      await sendBookingEmail('modified', updated);
      await logActivity(user.id, 'booking_request_modified');

      try {
        const settingsRows = await sql`select value from business_settings where key = 'general'`;
        const adminEmail = settingsRows[0] && settingsRows[0].value && settingsRows[0].value.email;
        if (adminEmail) {
          await sendAdminBookingModifiedEmail(updated, adminEmail);
          await sql`
            insert into client_emails (client_id, booking_id, to_email, subject, body, status)
            values (${updated.client_id || null}, ${updated.id}, ${adminEmail}, ${'Client modified appointment request'}, ${'Client edited and resubmitted a pending appointment request.'}, 'sent')
          `;
        }
      } catch (notifyErr) {
        console.error('admin modification notification failed', notifyErr);
      }

      await sql`
        insert into client_emails (client_id, booking_id, to_email, subject, body, status)
        values (${updated.client_id || null}, ${updated.id}, ${updated.email}, ${'Your appointment request was updated'}, ${'Confirmation sent to client after they resubmitted their request.'}, 'sent')
      `;

      return res.status(200).json({ success: true, booking: updated });
    } catch (err) {
      console.error('my-bookings update failed', err);
      return res.status(500).json({ error: 'Could not update your booking request.' });
    }
  }

  res.setHeader('Allow', 'GET, PUT');
  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleMyBookingHistory(req, res, user) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id } = req.query;
  if (!id) {
    return res.status(400).json({ error: 'id is required' });
  }

  try {
    const sql = getSql();
    const bookingRows = await sql`select * from bookings where id = ${id}`;
    if (bookingRows.length === 0) {
      return res.status(404).json({ error: 'Booking request not found.' });
    }
    if (!ownsBooking(bookingRows[0], user)) {
      return res.status(403).json({ error: 'You can only view your own booking requests.' });
    }

    const history = await sql`
      select id, changed_by, action, snapshot, created_at from booking_history
      where booking_id = ${id}
      order by created_at asc
    `;

    return res.status(200).json({ booking: bookingRows[0], history });
  } catch (err) {
    console.error('my-booking-history fetch failed', err);
    return res.status(500).json({ error: 'Could not load the request history.' });
  }
}

module.exports = async (req, res) => {
  const action = Array.isArray(req.query.action) ? req.query.action[0] : req.query.action;

  const user = await getSessionUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Not logged in' });
  }

  if (action === 'me') return handleMe(req, res, user);
  if (action === 'privacy') return handlePrivacy(req, res, user);
  if (action === 'notifications') return handleNotifications(req, res, user);
  if (action === 'password') return handlePassword(req, res, user);
  if (action === 'activity') return handleActivity(req, res, user);
  if (action === 'my-bookings') return handleMyBookings(req, res, user);
  if (action === 'my-booking-history') return handleMyBookingHistory(req, res, user);
  if (action === 'email-history') return handleEmailHistory(req, res, user);

  return res.status(404).json({ error: 'Not found' });
};
