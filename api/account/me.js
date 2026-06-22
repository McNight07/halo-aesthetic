const { getSql } = require('../_db/client');
const { getSessionUser, sanitizeUser, logActivity } = require('../_db/auth');

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

module.exports = async (req, res) => {
  const user = await getSessionUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Not logged in' });
  }

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
};
