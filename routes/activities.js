const express = require('express');
const router = express.Router();
const db = require('../config/db');
const auth = require('../middleware/auth');
const checkPermission = require('../middleware/checkPermission');
const { consumeApprovedPermissionRequest } = require('../utils/permissionHelper');

// Get all activities
router.get('/', auth, async (req, res) => {
  console.log('[GET /activities]', { query: req.query });
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    
    let query = `
      SELECT a.*, c.client_name, c.company_name, u.name as user_name, 
             at.name as type_name, cs.name as call_status_name 
      FROM activities a 
      LEFT JOIN clients c ON a.client_id = c.id 
      LEFT JOIN users u ON a.user_id = u.id 
      LEFT JOIN activity_types at ON a.type_id = at.id 
      LEFT JOIN call_status cs ON a.call_status_id = cs.id
    `;
    let countQuery = 'SELECT COUNT(*) as total FROM activities a';
    const params = [];
    const countParams = [];
    const whereClauses = [];

    // Filter by user if not admin
    if (req.user.role !== 'Admin' && req.user.role_id !== 1) {
      whereClauses.push('a.user_id = ?');
      params.push(req.user.userId);
      countParams.push(req.user.userId);
    }

    if (req.query.client_id) {
      whereClauses.push('a.client_id = ?');
      params.push(req.query.client_id);
      countParams.push(req.query.client_id);
    }

    if (req.query.follow_up_date) {
      whereClauses.push('a.follow_up_date = ?');
      params.push(req.query.follow_up_date);
      countParams.push(req.query.follow_up_date);
    }

    if (req.query.status && req.query.status !== 'all') {
      // Normalize status in case frontend sends different casing / legacy values.
      const status = String(req.query.status).toLowerCase();
      // Allow only known statuses to prevent accidental mismatches.
      const allowed = ['pending', 'completed', 'canceled'];
      if (allowed.includes(status)) {
        whereClauses.push('a.status = ?');
        params.push(status);
        countParams.push(status);
      }
    }


    if (whereClauses.length) {
      query += ' WHERE ' + whereClauses.join(' AND ');
      countQuery += ' WHERE ' + whereClauses.join(' AND ');
    }

    query += ' ORDER BY a.follow_up_date DESC, a.created_at DESC LIMIT ? OFFSET ?';

    const [rows] = await db.query(query, [...params, limit, offset]);
    const [countResult] = await db.query(countQuery, countParams);
    const total = countResult[0].total;

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

// Get pending follow-ups
router.get('/pending', auth, async (req, res) => {
  try {
    // Auto-cancel overdue pending meetings based on date and time
    await db.query(`
      UPDATE activities 
      SET status = 'canceled' 
      WHERE status = 'pending' 
      AND follow_up_date IS NOT NULL 
      AND (
        (meeting_time IS NOT NULL AND CONCAT(follow_up_date, ' ', meeting_time) < NOW())
        OR
        (meeting_time IS NULL AND DATE(follow_up_date) < CURDATE())
      )
    `);

    const isAdmin = req.user.role === 'Admin' || req.user.role_id === 1;
    let query = `
      SELECT a.*, c.client_name, c.company_name, c.mobile, c.email, 
             u.name as user_name, at.name as type_name, cs.name as call_status_name,
             DATE_FORMAT(a.follow_up_date, '%W') as follow_up_day
      FROM activities a 
      LEFT JOIN clients c ON a.client_id = c.id 
      LEFT JOIN users u ON a.user_id = u.id 
      LEFT JOIN activity_types at ON a.type_id = at.id 
      LEFT JOIN call_status cs ON a.call_status_id = cs.id
      WHERE a.status = 'pending' AND a.follow_up_date >= CURDATE()
    `;
    const params = [];

    if (!isAdmin) {
      query += ' AND a.user_id = ?';
      params.push(req.user.userId);
    }

    query += ' ORDER BY a.follow_up_date ASC LIMIT 10';

    const [rows] = await db.query(query, params);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get activity by id
router.get('/:id', auth, async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT a.*, c.client_name, c.company_name, u.name as user_name, 
             at.name as type_name, cs.name as call_status_name 
      FROM activities a 
      LEFT JOIN clients c ON a.client_id = c.id 
      LEFT JOIN users u ON a.user_id = u.id 
      LEFT JOIN activity_types at ON a.type_id = at.id 
      LEFT JOIN call_status cs ON a.call_status_id = cs.id 
      WHERE a.id = ?
    `, [req.params.id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Activity not found' });
    }
    res.json(rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get activities by client id
router.get('/client/:clientId', auth, async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT a.*, c.client_name, u.name as user_name, 
             at.name as type_name, cs.name as call_status_name 
      FROM activities a 
      LEFT JOIN clients c ON a.client_id = c.id 
      LEFT JOIN users u ON a.user_id = u.id 
      LEFT JOIN activity_types at ON a.type_id = at.id 
      LEFT JOIN call_status cs ON a.call_status_id = cs.id 
      WHERE a.client_id = ?
      ORDER BY a.created_at DESC
    `, [req.params.clientId]);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create activity
router.post('/', auth, async (req, res) => {
  try {
    const {
      client_id,
      type_id,
      call_status_id,
      status,
      follow_up_date,
      remarks,
      user_id,
    } = req.body;

    // FIX: Check if IDs are empty strings and convert to NULL
    const clientVal = client_id === "" ? null : client_id;
    const typeVal = type_id === "" ? null : type_id;
    const callStatusVal = call_status_id === "" ? null : call_status_id;

    // Allow optional assignment to a specific user for meeting scheduling.
    // If not provided, default to the authenticated user's id.
    const assignedUserId =
      user_id === "" || user_id === undefined || user_id === null
        ? req.user.userId
        : user_id;

    // Duplicate prevention: one meeting per client per date
    if (clientVal && typeVal && follow_up_date) {
      // Resolve whether type_id is the "meeting" type
      const [typeRows] = await db.query(
        'SELECT id FROM activity_types WHERE id = ? AND LOWER(name) = "meeting"',
        [typeVal]
      );

      if (typeRows.length > 0) {
        const [dupRows] = await db.query(
          `
          SELECT a.id
          FROM activities a
          INNER JOIN activity_types at ON a.type_id = at.id
          WHERE a.client_id = ?
            AND a.follow_up_date IS NOT NULL
            AND DATE(a.follow_up_date) = DATE(?)
            AND at.name = 'meeting'
          LIMIT 1
        `,
          [clientVal, follow_up_date]
        );

        if (dupRows.length > 0) {
          return res.status(409).json({
            error: 'A meeting is already scheduled for this client on the selected date.',
          });
        }
      }
    }

    const [result] = await db.query(
      'INSERT INTO activities (client_id, user_id, type_id, call_status_id, status, follow_up_date, meeting_time, remarks) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [
        clientVal,
        assignedUserId,
        typeVal,
        callStatusVal,
        status || 'pending',
        follow_up_date || null,
        req.body.meeting_time || null,
        remarks || null,
      ]
    );

    res.status(201).json({
      id: result.insertId,
      client_id: clientVal,
      user_id: assignedUserId,
      type_id: typeVal,
      call_status_id: callStatusVal,
      status,
      follow_up_date,
      remarks,
    });
  } catch (error) {
    console.error('Create activity error:', error);
    res.status(500).json({ error: error.sqlMessage || error.message });
  }
});


// Update activity
// Meetings are allowed for Admin/Executive (UI already enforces, but backend must allow too)
router.put('/:id', auth, async (req, res, next) => {
  const isAdminOrExecutive =
    req.user?.role === 'Admin' ||
    Number(req.user?.role_id) === 1 ||
    req.user?.role === 'Executive' ||
    Number(req.user?.role_id) === 2;

// Allow Admin/Executive to update meeting status without requiring permission_requests
  if (!isAdminOrExecutive) {
    // Non-admins must keep the original permission gate
    return checkPermission('edit_followup')(req, res, next);
  }

  return next();
}, async (req, res) => {
  try {
    // Verify activity exists
    const [activityCheck] = await db.query('SELECT id FROM activities WHERE id = ?', [req.params.id]);
    if (activityCheck.length === 0) {
      return res.status(404).json({ error: 'Activity not found' });
    }

    const { client_id, type_id, call_status_id, status, follow_up_date, remarks } = req.body;

    // Enforce: only Admin/Executive can update meetings to completed/canceled.
    // Also block updates once a meeting is already completed.
if (status && (status === 'completed' || status === 'canceled')) {
      const isAdminOrExecutive = req.user.role === 'Admin' || req.user.role_id === 1 || req.user.role === 'Executive' || req.user.role_id === 2;

      const [activityTypeRows] = await db.query(
        `SELECT at.name AS type_name
         FROM activities a
         INNER JOIN activity_types at ON a.type_id = at.id
         WHERE a.id = ?`,
        [req.params.id]
      );

      const typeName = activityTypeRows?.[0]?.type_name;

      // If it's a meeting, apply the stricter rule.
      if (typeName && typeName.toLowerCase() === 'meeting') {
        if (!isAdminOrExecutive) {
          return res.status(403).json({
            error: 'Access denied: only Admin/Executive can complete or cancel meetings',
          });
        }

        const [currentRows] = await db.query('SELECT status FROM activities WHERE id = ?', [req.params.id]);
        const currentStatus = currentRows?.[0]?.status;
        if (currentStatus === 'completed' && status !== 'completed') {
          // Once completed, do not allow non-admin transitions.
          // (Admin/Executive still can attempt, but current requirement says only admin/executive can update once completed.)
          if (!isAdminOrExecutive) {
            return res.status(403).json({
              error: 'Access denied: meeting already completed',
            });
          }
        }
      }
    }

    // FIX: Check if IDs are empty strings and convert to NULL
    const clientVal = client_id === "" ? null : client_id;
    const typeVal = type_id === "" ? null : type_id;
    const callStatusVal = call_status_id === "" ? null : call_status_id;

    // Duplicate prevention on meeting updates
    // If the updated activity is/turns into a meeting and client/date match another meeting, block.
    if (clientVal && typeVal && follow_up_date) {
      const [typeRows] = await db.query(
        'SELECT id FROM activity_types WHERE id = ? AND LOWER(name) = "meeting"',
        [typeVal]
      );

      if (typeRows.length > 0) {
        const [dupRows] = await db.query(
          `
          SELECT a.id
          FROM activities a
          INNER JOIN activity_types at ON a.type_id = at.id
          WHERE a.client_id = ?
            AND a.follow_up_date IS NOT NULL
            AND DATE(a.follow_up_date) = DATE(?)
            AND at.name = 'meeting'
            AND a.id != ?
          LIMIT 1
        `,
          [clientVal, follow_up_date, req.params.id]
        );

        if (dupRows.length > 0) {
          return res.status(409).json({
            error: 'A meeting is already scheduled for this client on the selected date.',
          });
        }
      }
    }

    // Allow assignment of meeting to executive.
    // Frontend may send either `user_id` (backend-native) or `executive_user_id`.
    // Normalize both to `user_id` so executives can see converted meetings.
    let targetUserId = req.user.userId;

    const incomingUserId =
      req.body.user_id !== undefined && req.body.user_id !== null && req.body.user_id !== ''
        ? req.body.user_id
        : null;

    const incomingExecutiveUserId =
      req.body.executive_user_id !== undefined && req.body.executive_user_id !== null && req.body.executive_user_id !== ''
        ? req.body.executive_user_id
        : null;

    if (incomingUserId !== null) {
      targetUserId = incomingUserId;
    } else if (incomingExecutiveUserId !== null) {
      targetUserId = incomingExecutiveUserId;
    }

    const isAdmin = req.user.role === 'Admin' || req.user.role_id === 1;


    // If non-admin is trying to change ownership, permit only when the activity is a meeting.
    if (!isAdmin && targetUserId !== req.user.userId) {
      const [activityTypeRows] = await db.query(
        `SELECT at.name AS type_name
         FROM activities a
         INNER JOIN activity_types at ON a.type_id = at.id
         WHERE a.id = ?`,
        [req.params.id]
      );

      const typeName = activityTypeRows?.[0]?.type_name;
      const isMeeting = typeName && typeName.toLowerCase() === 'meeting';

      if (!isMeeting) {
        return res.status(403).json({
          error: 'Access denied: only Admin can reassign non-meeting activities to other users.',
        });
      }
    }

    await db.query(
      'UPDATE activities SET client_id = ?, user_id = ?, type_id = ?, call_status_id = ?, status = ?, follow_up_date = ?, meeting_time = ?, remarks = ? WHERE id = ?',
      [clientVal, targetUserId, typeVal, callStatusVal, status || 'pending', follow_up_date || null, req.body.meeting_time || null, remarks || null, req.params.id]
    );


    // Consume after successful update to guarantee single-use.
    // Some endpoints can be reached via role-based bypass; in that case
    // approvedPermissionRequestId may be missing.
    if (req.approvedPermissionRequestId) {
      try {
        await consumeApprovedPermissionRequest(req.approvedPermissionRequestId);
      } catch (consumeErr) {
        console.error('[Route:PUT] Failed consuming permission:', consumeErr);
        return res.status(500).json({
          error: 'Permission consumption failed. Please request permission again.'
        });
      }
    }


    res.json({ message: 'Activity updated successfully' });
  } catch (error) {
    console.error('Update activity error:', error);
    res.status(500).json({ error: error.sqlMessage || error.message });
  }
});

// Delete activity
router.delete('/:id', auth, checkPermission('delete_followup'), async (req, res) => {
  try {
    // Verify activity exists
    const [activityCheck] = await db.query('SELECT id FROM activities WHERE id = ?', [req.params.id]);
    if (activityCheck.length === 0) {
      return res.status(404).json({ error: 'Activity not found' });
    }

    await db.query('DELETE FROM activities WHERE id = ?', [req.params.id]);

    if (req.approvedPermissionRequestId) {
      await consumeApprovedPermissionRequest(req.approvedPermissionRequestId);
    }

    res.json({ message: 'Activity deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
