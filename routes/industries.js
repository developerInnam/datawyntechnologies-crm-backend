const express = require('express');
const router = express.Router();
const db = require('../config/db');
const auth = require('../middleware/auth');
const admin = require('../middleware/admin');

// Get all industries (authenticated users)
router.get('/', auth, async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM industries');
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get industry by id (authenticated users)
router.get('/:id', auth, async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM industries WHERE id = ?', [req.params.id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Industry not found' });
    }
    res.json(rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create industry (authenticated users)
router.post('/', auth, async (req, res) => {
  try {
    const { name } = req.body;
    const [result] = await db.query('INSERT INTO industries (name) VALUES (?)', [name]);
    res.status(201).json({ id: result.insertId, name });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update industry (admin only)
router.put('/:id', auth, admin, async (req, res) => {
  try {
    const { name } = req.body;
    await db.query('UPDATE industries SET name = ? WHERE id = ?', [name, req.params.id]);
    res.json({ message: 'Industry updated successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete industry (admin only)
router.delete('/:id', auth, admin, async (req, res) => {
  try {
    await db.query('DELETE FROM industries WHERE id = ?', [req.params.id]);
    res.json({ message: 'Industry deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
