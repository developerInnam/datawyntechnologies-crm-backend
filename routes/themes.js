const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const db = require('../config/db');

router.put('/me', auth, async (req, res) => {
  try {
    const userId = req.user.userId;
    let { theme } = req.body;

    if (typeof theme !== 'string') {
      return res.status(400).json({ error: 'theme must be a string' });
    }

    theme = theme.toLowerCase();
    if (!['light', 'dark'].includes(theme)) {
      return res.status(400).json({ error: 'theme must be either light or dark' });
    }

    await db.query('UPDATE users SET dashboard_theme = ? WHERE id = ?', [theme, userId]);

    res.json({ message: 'Theme updated successfully', theme });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

