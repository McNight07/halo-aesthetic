const { destroySession, clearSessionCookie, getSessionTokenFromRequest } = require('../_db/auth');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = getSessionTokenFromRequest(req);
  await destroySession(token);
  clearSessionCookie(res);
  return res.status(200).json({ success: true });
};
