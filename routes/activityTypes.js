const express = require('express');
const router = express.Router();
const db = require('../config/db');
const auth = require('../middleware/auth');
const admin = require('../middleware/admin');

// Get all activity types (authenticated users)
router.get('/', auth, async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM activity_types');
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get activity type by id (authenticated users)
router.get('/:id', auth, async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM activity_types WHERE id = ?', [req.params.id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Activity type not found' });
    }
    res.json(rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create activity type (admin only)
router.post('/', auth, admin, async (req, res) => {
  try {
    const { name } = req.body;
    const [result] = await db.query('INSERT INTO activity_types (name) VALUES (?)', [name]);
    res.status(201).json({ id: result.insertId, name });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update activity type (admin only)
router.put('/:id', auth, admin, async (req, res) => {
  try {
    const { name } = req.body;
    await db.query('UPDATE activity_types SET name = ? WHERE id = ?', [name, req.params.id]);
    res.json({ message: 'Activity type updated successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete activity type (admin only)
router.delete('/:id', auth, admin, async (req, res) => {
  try {
    await db.query('DELETE FROM activity_types WHERE id = ?', [req.params.id]);
    res.json({ message: 'Activity type deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
