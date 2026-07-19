const express = require('express');
const router = express.Router();
const db = require('../config/db');
const auth = require('../middleware/auth');
const admin = require('../middleware/admin');

// Get all permissions (authenticated users)
router.get('/', auth, async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM permissions');
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get permission by id (authenticated users)
router.get('/:id', auth, async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM permissions WHERE id = ?', [req.params.id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Permission not found' });
    }
    res.json(rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create permission (admin only)
router.post('/', auth, admin, async (req, res) => {
  try {
    const { name } = req.body;
    const [result] = await db.query('INSERT INTO permissions (name) VALUES (?)', [name]);
    res.status(201).json({ id: result.insertId, name });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update permission (admin only)
router.put('/:id', auth, admin, async (req, res) => {
  try {
    const { name } = req.body;
    await db.query('UPDATE permissions SET name = ? WHERE id = ?', [name, req.params.id]);
    res.json({ message: 'Permission updated successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete permission (admin only)
router.delete('/:id', auth, admin, async (req, res) => {
  try {
    await db.query('DELETE FROM permissions WHERE id = ?', [req.params.id]);
    res.json({ message: 'Permission deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Check if current user has a specific permission
router.get('/check/:permissionName', auth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const permissionName = req.params.permissionName;

    // Check if user is admin (admins have all permissions)
    const [userRole] = await db.query(`
      SELECT r.name as role_name, u.role_id 
      FROM users u
      JOIN roles r ON u.role_id = r.id
      WHERE u.id = ?
    `, [userId]);

    if (userRole.length > 0 && (userRole[0].role_name === 'Admin' || userRole[0].role_id === 1)) {
      return res.json({ hasPermission: true });
    }

    // Check if user has the specific permission
    const [userPermissions] = await db.query(`
      SELECT p.name 
      FROM permissions p
      JOIN role_permissions rp ON p.id = rp.permission_id
      JOIN users u ON u.role_id = rp.role_id
      WHERE u.id = ? AND p.name = ?
    `, [userId, permissionName]);

    res.json({ hasPermission: userPermissions.length > 0 });
  } catch (error) {
    console.error('Error checking permission:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
