const jwt = require('jsonwebtoken');

async function adminLogin(req, res) {
  try {
    const { username, password } = req.body;
    const ADMIN_USER = process.env.ADMIN_USER || 'admin';
    const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || process.env.SUPERADMIN_PASSWORD;

    if (!username || !password) {
      return res.status(400).json({ code: 0, message: 'username and password are required' });
    }

    if (!ADMIN_PASSWORD) {
      return res.status(500).json({ code: -1, message: 'Server misconfigured: ADMIN_PASSWORD not set' });
    }

    if (username !== ADMIN_USER || password !== ADMIN_PASSWORD) {
      return res.status(401).json({ code: 0, message: 'Invalid credentials' });
    }

    const token = jwt.sign({ role: 'superadmin' }, process.env.SECRET_KEY, {
      algorithm: 'HS512',
      expiresIn: '1d',
    });

    return res.json({ code: 1, message: 'Admin login success', token });
  } catch (err) {
    console.error('adminLogin error:', err);
    return res.status(500).json({ code: -1, message: 'Internal Server Error' });
  }
}

module.exports = { adminLogin };
