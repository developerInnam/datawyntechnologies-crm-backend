const auth = require('./auth');

const admin = (req, res, next) => {
  auth(req, res, (err) => {
    if (err) return next(err);
    
    // Check if user is admin (role name 'Admin' or role_id 1)
    if (req.user.role === 'Admin' || req.user.role_id === 1) {
      next();
    } else {
      res.status(403).json({ error: 'Access denied. Admin only.' });
    }
  });
};

module.exports = admin;
