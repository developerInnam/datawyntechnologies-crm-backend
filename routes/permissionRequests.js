const express = require('express');
const router = express.Router();
const db = require('../config/db');
const auth = require('../middleware/auth');

// Create a permission request
router.post('/', auth, async (req, res) => {
  try {
    const { permission_name, resource_type, resource_id, action, reason } = req.body;
    const userId = req.user.userId;

    // Check if there's already a pending request for this specific resource
    const [existingRequests] = await db.query(`
      SELECT id FROM permission_requests 
      WHERE user_id = ? AND permission_name = ? AND resource_type = ? 
      AND resource_id = ? AND action = ? AND status = 'pending'
    `, [userId, permission_name, resource_type, resource_id, action]);

    if (existingRequests.length > 0) {
      return res.status(400).json({ error: 'A pending request already exists for this action' });
    }

    // Check if there's already an unconsumed approved request for this specific resource
    // (single-use: after edit it becomes 'consumed')
    const [approvedRequests] = await db.query(`
      SELECT id FROM permission_requests 
      WHERE user_id = ? AND permission_name = ? AND resource_type = ? 
      AND resource_id = ? AND action = ? AND status = 'approved'
      LIMIT 1
    `, [userId, permission_name, resource_type, resource_id, action]);

    if (approvedRequests.length > 0) {
      return res.status(400).json({ error: 'You already have an active approved request for this resource' });
    }

    // Create the permission request
    const [result] = await db.query(`
      INSERT INTO permission_requests (user_id, permission_name, resource_type, resource_id, action, reason)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [userId, permission_name, resource_type, resource_id, action, reason]);

    // Get user name and client name (if applicable)
    const [userInfo] = await db.query(`
      SELECT name FROM users WHERE id = ?
    `, [userId]);

    let clientName = '';
    if (resource_type === 'client' && resource_id) {
      const [clientInfo] = await db.query(`
        SELECT client_name FROM clients WHERE id = ?
      `, [resource_id]);
      if (clientInfo.length > 0) {
        clientName = clientInfo[0].client_name;
      }
    }

    // Notify users with control_permission_request permission AND admins about the new request
    const [authorizedUsers] = await db.query(`
      SELECT DISTINCT u.id FROM users u
      LEFT JOIN role_permissions rp ON u.role_id = rp.role_id
      LEFT JOIN permissions p ON rp.permission_id = p.id
      WHERE u.status = 'active' AND (p.name = 'control_permission_request' OR u.role_id = 1 OR EXISTS (
        SELECT 1 FROM roles r WHERE r.id = u.role_id AND r.name = 'Admin'
      ))
    `);

    console.log('Authorized users found:', authorizedUsers.length);

    const userName = userInfo.length > 0 ? userInfo[0].name : 'Unknown User';
    const message = `${userName} has requested permission to ${action} ${resource_type}${clientName ? ` (${clientName})` : ''}. Reason: ${reason || 'No reason provided'}`;

    const broker = require('../sse/notificationBroker');

    for (const authorizedUser of authorizedUsers) {
      await db.query(`
        INSERT INTO notifications (user_id, type, title, message, related_request_id)
        VALUES (?, 'new_permission_request', 'New Permission Request', ?, ?)
      `, [authorizedUser.id, message, result.insertId]);

      broker.publishToUser(authorizedUser.id, {
        kind: 'notification',
        type: 'new_permission_request',
        related_request_id: result.insertId,
      });

      console.log('Notification sent to authorized user:', authorizedUser.id);
    }

    res.status(201).json({ 
      message: 'Permission request created successfully', 
      requestId: result.insertId 
    });

  } catch (error) {
    console.error('Error creating permission request:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all permission requests (for users with control_permission_request permission)
router.get('/', auth, async (req, res) => {
  try {
    const userId = req.user.userId;
    
    // Check if user has control_permission_request permission
    const [userPermissions] = await db.query(`
      SELECT p.name 
      FROM permissions p
      JOIN role_permissions rp ON p.id = rp.permission_id
      JOIN users u ON u.role_id = rp.role_id
      WHERE u.id = ? AND p.name = 'control_permission_request'
    `, [userId]);

    if (userPermissions.length === 0) {
      return res.status(403).json({ error: 'Access denied. You need control_permission_request permission.' });
    }

    const [requests] = await db.query(`
      SELECT pr.id, pr.user_id, pr.permission_name, pr.resource_type, pr.resource_id, pr.action, pr.reason, pr.status, pr.requested_at, pr.reviewed_at, pr.reviewed_by, pr.review_notes, u.name as user_name, u.email as user_email
      FROM permission_requests pr
      JOIN users u ON pr.user_id = u.id
      ORDER BY pr.requested_at DESC
    `);

    res.json(requests);
  } catch (error) {
    console.error('Error fetching permission requests:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get user's own permission requests
router.get('/my-requests', auth, async (req, res) => {
  try {
    const userId = req.user.userId;

    const [requests] = await db.query(`
      SELECT * FROM permission_requests
      WHERE user_id = ?
      ORDER BY requested_at DESC
    `, [userId]);

    res.json(requests);
  } catch (error) {
    console.error('Error fetching user permission requests:', error);
    res.status(500).json({ error: error.message });
  }
});

// Approve a permission request
router.put('/:id/approve', auth, async (req, res) => {
  try {
    const requestId = req.params.id;
    const userId = req.user.userId;
    const { review_notes } = req.body;

    // Check if user has control_permission_request permission
    const [userPermissions] = await db.query(`
      SELECT p.name 
      FROM permissions p
      JOIN role_permissions rp ON p.id = rp.permission_id
      JOIN users u ON u.role_id = rp.role_id
      WHERE u.id = ? AND p.name = 'control_permission_request'
    `, [userId]);

    if (userPermissions.length === 0) {
      return res.status(403).json({ error: 'Access denied. You need control_permission_request permission.' });
    }

    // Get the request details
    const [requests] = await db.query(`
      SELECT * FROM permission_requests WHERE id = ?
    `, [requestId]);

    if (requests.length === 0) {
      return res.status(404).json({ error: 'Request not found' });
    }

    const request = requests[0];

    if (request.status !== 'pending') {
      return res.status(400).json({ error: 'Request has already been processed' });
    }

    // Update the request status
    await db.query(`
      UPDATE permission_requests 
      SET status = 'approved', reviewed_at = NOW(), reviewed_by = ?, review_notes = ?
      WHERE id = ?
    `, [userId, review_notes, requestId]);

    console.log('Permission request approved:', { requestId });

    // Get client name for the notification
    let clientName = '';
    if (request.resource_type === 'client' && request.resource_id) {
      const [clientInfo] = await db.query(`
        SELECT client_name FROM clients WHERE id = ?
      `, [request.resource_id]);
      if (clientInfo.length > 0) {
        clientName = clientInfo[0].client_name;
      }
    }

    // Notify the user with detailed information including client ID
    const message = `Your request to ${request.action} ${request.resource_type}${clientName ? ` (${clientName})` : ''} has been approved. You can now perform this action on this specific resource.`;
    await db.query(`
      INSERT INTO notifications (user_id, type, title, message, related_request_id)
      VALUES (?, 'permission_approved', 'Permission Request Approved', ?, ?)
    `, [request.user_id, message, requestId]);

    const broker = require('../sse/notificationBroker');
    broker.publishToUser(request.user_id, {
      kind: 'notification',
      type: 'permission_approved',
      related_request_id: requestId,
    });

    res.json({ message: 'Permission request approved successfully' });

  } catch (error) {
    console.error('Error approving permission request:', error);
    res.status(500).json({ error: error.message });
  }
});

// Reject a permission request
router.put('/:id/reject', auth, async (req, res) => {
  try {
    const requestId = req.params.id;
    const userId = req.user.userId;
    const { review_notes } = req.body;

    // Check if user has control_permission_request permission
    const [userPermissions] = await db.query(`
      SELECT p.name 
      FROM permissions p
      JOIN role_permissions rp ON p.id = rp.permission_id
      JOIN users u ON u.role_id = rp.role_id
      WHERE u.id = ? AND p.name = 'control_permission_request'
    `, [userId]);

    if (userPermissions.length === 0) {
      return res.status(403).json({ error: 'Access denied. You need control_permission_request permission.' });
    }

    // Get the request details
    const [requests] = await db.query(`
      SELECT * FROM permission_requests WHERE id = ?
    `, [requestId]);

    if (requests.length === 0) {
      return res.status(404).json({ error: 'Request not found' });
    }

    const request = requests[0];

    if (request.status !== 'pending') {
      return res.status(400).json({ error: 'Request has already been processed' });
    }

    // Update the request status
    await db.query(`
      UPDATE permission_requests 
      SET status = 'rejected', reviewed_at = NOW(), reviewed_by = ?, review_notes = ?
      WHERE id = ?
    `, [userId, review_notes, requestId]);

    // Notify the user
    await db.query(`
      INSERT INTO notifications (user_id, type, title, message, related_request_id)
      VALUES (?, 'permission_rejected', 'Permission Request Rejected', ?, ?)
    `, [request.user_id, `Your request to ${request.action} ${request.resource_type} has been rejected`, requestId]);

    const broker = require('../sse/notificationBroker');
    broker.publishToUser(request.user_id, {
      kind: 'notification',
      type: 'permission_rejected',
      related_request_id: requestId,
    });

    res.json({ message: 'Permission request rejected successfully' });

  } catch (error) {
    console.error('Error rejecting permission request:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
