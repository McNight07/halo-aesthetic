const { getSql } = require('../_db/client');
const { getSessionUser, verifyPassword, hashPassword, logActivity, sanitizeUser } = require('../_db/auth');

const EDITABLE_FIELDS = [
  'full_name',
  'phone',
  'date_of_birth',
  'gender',
  'bio',
  'location',
  'education',
  'social_links',
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

  return res.status(404).json({ error: 'Not found' });
};
