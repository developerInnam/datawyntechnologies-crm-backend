const jwt = require('jsonwebtoken');

const auth = (req, res, next) => {
  try {
    console.log('Auth middleware called for:', req.method, req.path);
    const tokenFromHeader = req.header('Authorization')?.replace('Bearer ', '');
    const tokenFromQuery = req.query?.token;
    const token = tokenFromHeader || tokenFromQuery;
    console.log('Token:', token ? 'Present' : 'Missing');

    if (!token) {
      console.log('No token found');
      return res.status(401).json({ error: 'No authentication token, access denied' });
    }


    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log('Decoded user:', decoded);
    req.user = decoded;
    next();
  } catch (error) {
    console.error('Auth error:', error.message);
    res.status(401).json({ error: 'Token is not valid' });
  }
};

module.exports = auth;
