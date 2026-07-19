const express = require('express');
const router = express.Router();
const db = require('../config/db');
const auth = require('../middleware/auth');

// Get all services
router.get('/', auth, async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM services ORDER BY name ASC');
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get service by id
router.get('/:id', auth, async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM services WHERE id = ?', [req.params.id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Service not found' });
    }
    res.json(rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create service (admin only)
router.post('/', auth, async (req, res) => {
  try {
    const { name, description } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Service name is required' });
    }

    const [result] = await db.query(
      'INSERT INTO services (name, description) VALUES (?, ?)',
      [name, description || null]
    );

    const [newService] = await db.query('SELECT * FROM services WHERE id = ?', [result.insertId]);
    res.status(201).json(newService[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update service (admin only)
router.put('/:id', auth, async (req, res) => {
  try {
    const { name, description } = req.body;

    // Check if service exists
    const [serviceCheck] = await db.query('SELECT id FROM services WHERE id = ?', [req.params.id]);
    if (serviceCheck.length === 0) {
      return res.status(404).json({ error: 'Service not found' });
    }

    await db.query(
      'UPDATE services SET name = ?, description = ? WHERE id = ?',
      [name, description || null, req.params.id]
    );

    const [updatedService] = await db.query('SELECT * FROM services WHERE id = ?', [req.params.id]);
    res.json(updatedService[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete service (admin only)
router.delete('/:id', auth, async (req, res) => {
  try {
    // Check if service exists
    const [serviceCheck] = await db.query('SELECT id FROM services WHERE id = ?', [req.params.id]);
    if (serviceCheck.length === 0) {
      return res.status(404).json({ error: 'Service not found' });
    }

    await db.query('DELETE FROM services WHERE id = ?', [req.params.id]);
    res.json({ message: 'Service deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
