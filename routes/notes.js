const express = require('express');
const router = express.Router();
const db = require('../config/db');
const auth = require('../middleware/auth');
const checkPermission = require('../middleware/checkPermission');
const { consumeApprovedPermissionRequest } = require('../utils/permissionHelper');

// Get all notes
router.get('/', auth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    
    // Get distinct client_ids with pagination
    let clientQuery = `
      SELECT DISTINCT n.client_id
      FROM notes n
    `;
    let countQuery = 'SELECT COUNT(DISTINCT client_id) as total FROM notes';
    const clientParams = [];
    const countParams = [];

    // Filter by user if not admin
    if (req.user.role !== 'Admin' && req.user.role_id !== 1) {
      clientQuery += ' WHERE n.user_id = ?';
      countQuery += ' WHERE user_id = ?';
      clientParams.push(req.user.userId);
      countParams.push(req.user.userId);
    }

    clientQuery += ' ORDER BY n.client_id LIMIT ? OFFSET ?';

    const [clientRows] = await db.query(clientQuery, [...clientParams, limit, offset]);
    const [countResult] = await db.query(countQuery, countParams);
    const total = countResult[0].total;

    // Get all notes for the paginated clients
    if (clientRows.length === 0) {
      return res.json({
        data: [],
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit)
        }
      });
    }

    const clientIds = clientRows.map(row => row.client_id);
    const placeholders = clientIds.map(() => '?').join(',');

    let notesQuery = `
      SELECT n.*, c.client_name, c.company_name, u.name as user_name 
      FROM notes n 
      LEFT JOIN clients c ON n.client_id = c.id 
      LEFT JOIN users u ON n.user_id = u.id
      WHERE n.client_id IN (${placeholders})
    `;
    const notesParams = [...clientIds];

    // Filter by user if not admin
    if (req.user.role !== 'Admin' && req.user.role_id !== 1) {
      notesQuery += ' AND n.user_id = ?';
      notesParams.push(req.user.userId);
    }

    notesQuery += ' ORDER BY n.created_at DESC';

    const [rows] = await db.query(notesQuery, notesParams);

    res.json({
      data: rows,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get note by id
router.get('/:id', auth, async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT n.*, c.client_name, c.company_name, u.name as user_name 
      FROM notes n 
      LEFT JOIN clients c ON n.client_id = c.id 
      LEFT JOIN users u ON n.user_id = u.id 
      WHERE n.id = ?
    `, [req.params.id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Note not found' });
    }
    res.json(rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get notes by client id
router.get('/client/:clientId', auth, async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT n.*, c.client_name, u.name as user_name 
      FROM notes n 
      LEFT JOIN clients c ON n.client_id = c.id 
      LEFT JOIN users u ON n.user_id = u.id 
      WHERE n.client_id = ?
      ORDER BY n.created_at DESC
    `, [req.params.clientId]);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create note
router.post('/', auth, async (req, res) => {
  try {
    const { client_id, note } = req.body;

    // FIX: Check if IDs are empty strings and convert to NULL
    const clientVal = client_id === "" ? null : client_id;

    // Automatically use current user's ID
    const [result] = await db.query(
      'INSERT INTO notes (client_id, user_id, note) VALUES (?, ?, ?)',
      [clientVal, req.user.userId, note || null]
    );
    res.status(201).json({ id: result.insertId, client_id: clientVal, user_id: req.user.userId, note });
  } catch (error) {
    console.error('Create note error:', error);
    res.status(500).json({ error: error.sqlMessage || error.message });
  }
});

// Update note
router.put('/:id', auth, checkPermission('edit_note'), async (req, res) => {
  try {
    // Verify note exists
    const [noteCheck] = await db.query('SELECT id FROM notes WHERE id = ?', [req.params.id]);
    if (noteCheck.length === 0) {
      return res.status(404).json({ error: 'Note not found' });
    }

    const { client_id, note } = req.body;

    // FIX: Check if IDs are empty strings and convert to NULL
    const clientVal = client_id === "" ? null : client_id;

    await db.query(
      'UPDATE notes SET client_id = ?, user_id = ?, note = ? WHERE id = ?',
      [clientVal, req.user.userId, note || null, req.params.id]
    );

    // Consume permission AFTER successful update (only for non-admin users)
    if (req.user.role !== 'Admin' && req.user.role_id !== 1) {
      if (req.approvedPermissionRequestId) {
        try {
          console.log(`[Route] Consuming permission for edit_note on note ${req.params.id}`);
          await consumeApprovedPermissionRequest(req.approvedPermissionRequestId);
        } catch (consumeErr) {
          console.error(`[Route] Failed to consume permission:`, consumeErr);
          return res.status(500).json({
            error: 'Permission consumption failed. Please request permission again.'
          });
        }
      } else {
        return res.status(403).json({
          error: 'Permission denied: missing approved permission id'
        });
      }
    }

    res.json({ message: 'Note updated successfully' });
  } catch (error) {
    console.error('Update note error:', error);
    res.status(500).json({ error: error.sqlMessage || error.message });
  }
});

// Delete note
router.delete('/:id', auth, checkPermission('delete_note'), async (req, res) => {
  try {
    // Verify note exists
    const [noteCheck] = await db.query('SELECT id FROM notes WHERE id = ?', [req.params.id]);
    if (noteCheck.length === 0) {
      return res.status(404).json({ error: 'Note not found' });
    }

    await db.query('DELETE FROM notes WHERE id = ?', [req.params.id]);

    // Consume permission AFTER successful delete
    if (req.approvedPermissionRequestId) {
      try {
        console.log(`[Route] Consuming permission for delete_note on note ${req.params.id}`);
        await consumeApprovedPermissionRequest(req.approvedPermissionRequestId);
      } catch (consumeErr) {
        console.error(`[Route] Failed to consume permission:`, consumeErr);
        // Still return success but log the consumption failure
      }
    }

    res.json({ message: 'Note deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Bulk delete notes
router.delete('/bulk/delete', auth, checkPermission('delete_note'), async (req, res) => {
  try {
    const { noteIds } = req.body;
    
    if (!noteIds || !Array.isArray(noteIds) || noteIds.length === 0) {
      return res.status(400).json({ error: 'Note IDs array is required' });
    }

    // Verify notes exist
    const placeholders = noteIds.map(() => '?').join(',');
    const [noteCheck] = await db.query(`SELECT id FROM notes WHERE id IN (${placeholders})`, noteIds);
    
    if (noteCheck.length === 0) {
      return res.status(404).json({ error: 'No notes found' });
    }

    // Delete notes
    await db.query(`DELETE FROM notes WHERE id IN (${placeholders})`, noteIds);

    // Consume permission AFTER successful delete
    if (req.approvedPermissionRequestId) {
      try {
        console.log(`[Route] Consuming permission for bulk delete_note on notes ${noteIds.join(', ')}`);
        await consumeApprovedPermissionRequest(req.approvedPermissionRequestId);
      } catch (consumeErr) {
        console.error(`[Route] Failed to consume permission:`, consumeErr);
        // Still return success but log the consumption failure
      }
    }

    res.json({ message: `${noteCheck.length} notes deleted successfully` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
