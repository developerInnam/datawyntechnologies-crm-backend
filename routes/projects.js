const express = require('express');
const router = express.Router();
const db = require('../config/db');
const auth = require('../middleware/auth');
const checkPermission = require('../middleware/checkPermission');
const { consumeApprovedPermissionRequest } = require('../utils/permissionHelper');

// Get all projects
router.get('/', auth, async (req, res) => {
  try {
    let query = `
      SELECT p.*, c.client_name, c.company_name 
      FROM projects p 
      LEFT JOIN clients c ON p.client_id = c.id
    `;
    const params = [];

    // Filter by user if not admin
    if (req.user.role !== 'Admin' && req.user.role_id !== 1) {
      query += ' WHERE c.user_id = ?';
      params.push(req.user.userId);
    }

    query += ' ORDER BY p.created_at DESC';

    const [rows] = await db.query(query, params);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get project by id
router.get('/:id', auth, async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT p.*, c.client_name, c.company_name 
      FROM projects p 
      LEFT JOIN clients c ON p.client_id = c.id 
      WHERE p.id = ?
    `, [req.params.id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }
    res.json(rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get projects by client id
router.get('/client/:clientId', auth, async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM projects WHERE client_id = ?',
      [req.params.clientId]
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create project
router.post('/', auth, async (req, res) => {
  try {
    const { client_id, project_name, project_location, status, start_date, end_date } = req.body;

    // FIX: Check if IDs are empty strings and convert to NULL
    const clientVal = client_id === "" ? null : client_id;

    const [result] = await db.query(
      'INSERT INTO projects (client_id, project_name, project_location, status, start_date, end_date) VALUES (?, ?, ?, ?, ?, ?)',
      [clientVal, project_name, project_location || null, status || 'ongoing', start_date || null, end_date || null]
    );
    res.status(201).json({ id: result.insertId, client_id: clientVal, project_name, project_location, status, start_date, end_date });
  } catch (error) {
    console.error('Create project error:', error);
    res.status(500).json({ error: error.sqlMessage || error.message });
  }
});

// Update project
router.put('/:id', auth, checkPermission('edit_project'), async (req, res) => {
  try {
    // Verify project exists
    const [projectCheck] = await db.query('SELECT id FROM projects WHERE id = ?', [req.params.id]);
    if (projectCheck.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const { client_id, project_name, project_location, status, start_date, end_date } = req.body;

    // FIX: Check if IDs are empty strings and convert to NULL
    const clientVal = client_id === "" ? null : client_id;

    await db.query(
      'UPDATE projects SET client_id = ?, project_name = ?, project_location = ?, status = ?, start_date = ?, end_date = ? WHERE id = ?',
      [clientVal, project_name, project_location || null, status, start_date || null, end_date || null, req.params.id]
    );

    // Consume permission AFTER successful update
    if (req.approvedPermissionRequestId) {
      try {
        console.log(`[Route] Consuming permission for edit_project on project ${req.params.id}`);
        await consumeApprovedPermissionRequest(req.approvedPermissionRequestId);
      } catch (consumeErr) {
        console.error(`[Route] Failed to consume permission:`, consumeErr);
        // Still return success but log the consumption failure
      }
    }

    res.json({ message: 'Project updated successfully' });
  } catch (error) {
    console.error('Update project error:', error);
    res.status(500).json({ error: error.sqlMessage || error.message });
  }
});

// Delete project
router.delete('/:id', auth, checkPermission('delete_project'), async (req, res) => {
  try {
    // Verify project exists
    const [projectCheck] = await db.query('SELECT id FROM projects WHERE id = ?', [req.params.id]);
    if (projectCheck.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    await db.query('DELETE FROM projects WHERE id = ?', [req.params.id]);

    // Consume permission AFTER successful delete
    if (req.approvedPermissionRequestId) {
      try {
        console.log(`[Route] Consuming permission for delete_project on project ${req.params.id}`);
        await consumeApprovedPermissionRequest(req.approvedPermissionRequestId);
      } catch (consumeErr) {
        console.error(`[Route] Failed to consume permission:`, consumeErr);
        // Still return success but log the consumption failure
      }
    }

    res.json({ message: 'Project deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
