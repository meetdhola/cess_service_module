const jwt = require('jsonwebtoken');

module.exports = function auth(req, res, next) {
  const header = req.headers['authorization'];
  if (!header) return res.status(401).json({ error: 'No token' });

  const token = header.startsWith('Bearer ') ? header.slice(7) : header;
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET || 'cess_secret_2526');
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
};
