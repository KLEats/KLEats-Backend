const jwt = require('jsonwebtoken');

const SECRET_KEY = process.env.SECRET_KEY;

module.exports = function verifyAdminToken(req, res, next) {
  const token = req.headers['authorization'];

  if (!token) {
    return res.status(401).json({ code: -1, message: 'Not authenticated' });
  }

  try {
    const decoded = jwt.verify(token, SECRET_KEY);
    if (!decoded || decoded.role !== 'superadmin') {
      return res.status(403).json({ code: -1, message: 'Forbidden: admin access required' });
    }
    req.admin = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ code: -1, message: 'Invalid token.' });
  }
};
