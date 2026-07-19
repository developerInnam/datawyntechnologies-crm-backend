const express = require('express');
const router = express.Router();
const db = require('../config/db');
const auth = require('../middleware/auth');
const admin = require('../middleware/admin');

// Helper function to check if user has permission
const hasPermission = async (userId, permissionName) => {
  const [permissions] = await db.query(`
    SELECT p.name 
    FROM permissions p
    JOIN role_permissions rp ON p.id = rp.permission_id
    JOIN users u ON u.role_id = rp.role_id
    WHERE u.id = ? AND p.name = ?
  `, [userId, permissionName]);
  return permissions.length > 0;
};

// Get all roles with their permissions (authenticated users)
router.get('/', auth, async (req, res) => {
  try {
    const [roles] = await db.query('SELECT * FROM roles');
    
    // Get permissions for each role
    const rolesWithPermissions = await Promise.all(roles.map(async (role) => {
      const [permissions] = await db.query(
        'SELECT p.* FROM permissions p JOIN role_permissions rp ON p.id = rp.permission_id WHERE rp.role_id = ?',
        [role.id]
      );
      return {
        ...role,
        permissions
      };
    }));
    
    res.json(rolesWithPermissions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get role by id with permissions (authenticated users)
router.get('/:id', auth, async (req, res) => {
  try {
    const [roles] = await db.query('SELECT * FROM roles WHERE id = ?', [req.params.id]);
    if (roles.length === 0) {
      return res.status(404).json({ error: 'Role not found' });
    }
    
    const [permissions] = await db.query(
      'SELECT p.* FROM permissions p JOIN role_permissions rp ON p.id = rp.permission_id WHERE rp.role_id = ?',
      [req.params.id]
    );
    
    res.json({
      ...roles[0],
      permissions
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create role with permissions (requires manage_user permission)
router.post('/', auth, async (req, res) => {
  const connection = await db.getConnection();
  try {
    const userId = req.user.userId;
    const hasManagePermission = await hasPermission(userId, 'manage_user');

    if (!hasManagePermission) {
      return res.status(403).json({ error: 'Access denied. You need manage_user permission.' });
    }

    await connection.beginTransaction();
    
    const { name, permissions } = req.body;
    
    // Insert role
    const [result] = await connection.query('INSERT INTO roles (name) VALUES (?)', [name]);
    const roleId = result.insertId;
    
    // Insert role-permission associations
    if (permissions && permissions.length > 0) {
      const permissionValues = permissions.map(permissionId => [roleId, permissionId]);
      await connection.query(
        'INSERT INTO role_permissions (role_id, permission_id) VALUES ?',
        [permissionValues]
      );
    }
    
    await connection.commit();
    res.status(201).json({ id: roleId, name, permissions });
  } catch (error) {
    await connection.rollback();
    res.status(500).json({ error: error.message });
  } finally {
    connection.release();
  }
});

// Update role with permissions (requires manage_user permission)
router.put('/:id', auth, async (req, res) => {
  const connection = await db.getConnection();
  try {
    const userId = req.user.userId;
    const hasManagePermission = await hasPermission(userId, 'manage_user');

    if (!hasManagePermission) {
      return res.status(403).json({ error: 'Access denied. You need manage_user permission.' });
    }

    await connection.beginTransaction();
    
    const { name, permissions } = req.body;
    
    // Update role name
    await connection.query('UPDATE roles SET name = ? WHERE id = ?', [name, req.params.id]);
    
    // Delete existing role-permission associations
    await connection.query('DELETE FROM role_permissions WHERE role_id = ?', [req.params.id]);
    
    // Insert new role-permission associations
    if (permissions && permissions.length > 0) {
      const permissionValues = permissions.map(permissionId => [req.params.id, permissionId]);
      await connection.query(
        'INSERT INTO role_permissions (role_id, permission_id) VALUES ?',
        [permissionValues]
      );
    }
    
    await connection.commit();
    res.json({ message: 'Role updated successfully' });
  } catch (error) {
    await connection.rollback();
    res.status(500).json({ error: error.message });
  } finally {
    connection.release();
  }
});

// Delete role (requires manage_user permission)
router.delete('/:id', auth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const hasManagePermission = await hasPermission(userId, 'manage_user');

    if (!hasManagePermission) {
      return res.status(403).json({ error: 'Access denied. You need manage_user permission.' });
    }

    await db.query('DELETE FROM roles WHERE id = ?', [req.params.id]);
    res.json({ message: 'Role deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
