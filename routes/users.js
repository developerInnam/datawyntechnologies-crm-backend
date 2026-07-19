const express = require('express');
const router = express.Router();
const db = require('../config/db');
const bcrypt = require('bcryptjs');
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

// Get minimal user list for dropdowns (all authenticated users)
router.get('/list', auth, async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT id, name FROM users WHERE status = "active" ORDER BY name'
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all permissions
router.get('/permissions', auth, admin, async (req, res) => {
  try {
    const [rows] = await db.query('SELECT id, name FROM permissions ORDER BY name');
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get user permissions (from role)
router.get('/:id/permissions', auth, admin, async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT p.id, p.name 
      FROM permissions p 
      INNER JOIN role_permissions rp ON p.id = rp.permission_id 
      INNER JOIN users u ON u.role_id = rp.role_id
      WHERE u.id = ?
    `, [req.params.id]);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all users (requires manage_user permission)
router.get('/', auth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const hasManagePermission = await hasPermission(userId, 'manage_user');

    if (!hasManagePermission) {
      return res.status(403).json({ error: 'Access denied. You need manage_user permission.' });
    }

    const [rows] = await db.query(`
      SELECT u.*, r.name as role_name 
      FROM users u 
      LEFT JOIN roles r ON u.role_id = r.id
    `);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get user by id (requires edit_user permission or admin)
router.get('/:id', auth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const hasEditPermission = await hasPermission(userId, 'edit_user');

    if (!hasEditPermission) {
      return res.status(403).json({ error: 'Access denied. You need edit_user permission.' });
    }

    const [rows] = await db.query(`
      SELECT u.*, r.name as role_name 
      FROM users u 
      LEFT JOIN roles r ON u.role_id = r.id 
      WHERE u.id = ?
    `, [req.params.id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get user permissions (admin only)
router.get('/:id/permissions', auth, admin, async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT p.id, p.name 
      FROM user_permissions up
      JOIN permissions p ON up.permission_id = p.id
      WHERE up.user_id = ?
    `, [req.params.id]);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create user (requires manage_user permission)
router.post('/', auth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const hasManagePermission = await hasPermission(userId, 'manage_user');

    if (!hasManagePermission) {
      return res.status(403).json({ error: 'Access denied. You need manage_user permission.' });
    }

    const { name, email, phone, password, role_id, status, is_admin } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // If is_admin is true, assign the Admin role (role_id = 1)
    let finalRoleId = role_id;
    if (is_admin) {
      const [adminRole] = await db.query('SELECT id FROM roles WHERE name = "Admin" LIMIT 1');
      if (adminRole.length > 0) {
        finalRoleId = adminRole[0].id;
      }
    }
    
    const [result] = await db.query(
      'INSERT INTO users (name, email, phone, password, role_id, status) VALUES (?, ?, ?, ?, ?, ?)',
      [name, email, phone, hashedPassword, finalRoleId, status || 'active']
    );

    res.status(201).json({ id: result.insertId, name, email, phone, role_id: finalRoleId, status });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ================================
// Self profile (authenticated user)
// ================================

// Self profile (authenticated user)
router.put('/me', auth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { name, email, phone } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'email is required' });
    }

    // Ensure email is unique (except for the current user)
    const [existing] = await db.query(
      'SELECT id FROM users WHERE email = ? AND id <> ?',
      [email, userId]
    );
    if (existing.length > 0) {
      return res.status(400).json({ error: 'Email is already in use by another account' });
    }

    // Build dynamic update query based on provided fields
    let updateFields = [];
    let updateValues = [];

    if (name !== undefined) {
      updateFields.push('name = ?');
      updateValues.push(name);
    }
    if (email !== undefined) {
      updateFields.push('email = ?');
      updateValues.push(email);
    }
    if (phone !== undefined) {
      updateFields.push('phone = ?');
      updateValues.push(phone);
    }

    updateValues.push(userId);

    await db.query(
      `UPDATE users SET ${updateFields.join(', ')} WHERE id = ?`,
      updateValues
    );

    const [rows] = await db.query(
      `SELECT u.id, u.name, u.email, u.phone, u.role_id, u.status, r.name as role_name
       FROM users u
       LEFT JOIN roles r ON u.role_id = r.id
       WHERE u.id = ?`,
      [userId]
    );

    res.json({
      message: 'Profile updated successfully',
      user: rows[0]
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// Update user (requires manage_user permission)
router.put('/:id', auth, async (req, res) => {
    if (req.params.id === 'me') {
      return res.status(400).json({ error: 'Bad request' });
    }
  try {
    const userId = req.user.userId;
    const hasManagePermission = await hasPermission(userId, 'manage_user');

    if (!hasManagePermission) {
      return res.status(403).json({ error: 'Access denied. You need manage_user permission.' });
    }

    const { name, email, phone, password, role_id, status, is_admin } = req.body;
    
    // If is_admin is true, assign the Admin role (role_id = 1)
    let finalRoleId = role_id;
    if (is_admin) {
      const [adminRole] = await db.query('SELECT id FROM roles WHERE name = "Admin" LIMIT 1');
      if (adminRole.length > 0) {
        finalRoleId = adminRole[0].id;
      }
    }
    
    let query = 'UPDATE users SET name = ?, email = ?, phone = ?, role_id = ?, status = ?';
    let params = [name, email, phone, finalRoleId, status];
    
    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      query += ', password = ?';
      params.push(hashedPassword);
    }
    
    query += ' WHERE id = ?';
    params.push(req.params.id);
    
    await db.query(query, params);
    
    res.json({ message: 'User updated successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// Delete user (requires manage_user permission)
router.delete('/:id', auth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const hasManagePermission = await hasPermission(userId, 'manage_user');

    if (!hasManagePermission) {
      return res.status(403).json({ error: 'Access denied. You need manage_user permission.' });
    }

    await db.query('DELETE FROM users WHERE id = ?', [req.params.id]);
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Change current user's password
router.put('/me/password', auth, async (req, res) => {

  try {
    const userId = req.user.userId;
    const { oldPassword, newPassword } = req.body;

    if (!oldPassword || !newPassword) {
      return res.status(400).json({ error: 'oldPassword and newPassword are required' });
    }

    if (String(newPassword).length < 6) {
      return res.status(400).json({ error: 'newPassword must be at least 6 characters' });
    }

    const [rows] = await db.query('SELECT id, password FROM users WHERE id = ?', [userId]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = rows[0];
    const isMatch = await bcrypt.compare(oldPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: 'Old password is incorrect' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await db.query('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, userId]);

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Helper function to build date filter
const buildDateFilter = (filterType, startDate, endDate) => {
  let dateCondition = '1=1'; // Default no filter
  const params = [];

  switch (filterType) {
    case 'today':
      dateCondition = 'DATE(a.created_at) = CURDATE()';
      break;
    case 'this_week':
      dateCondition = 'YEARWEEK(a.created_at, 1) = YEARWEEK(CURDATE(), 1)';
      break;
    case 'this_month':
      dateCondition = 'MONTH(a.created_at) = MONTH(CURDATE()) AND YEAR(a.created_at) = YEAR(CURDATE())';
      break;
    case 'last_month':
      dateCondition = 'MONTH(a.created_at) = MONTH(CURDATE() - INTERVAL 1 MONTH) AND YEAR(a.created_at) = YEAR(CURDATE() - INTERVAL 1 MONTH)';
      break;
    case 'last_3_months':
      dateCondition = 'a.created_at >= DATE_SUB(CURDATE(), INTERVAL 3 MONTH)';
      break;
    case 'custom':
      if (startDate && endDate) {
        dateCondition = 'DATE(a.created_at) BETWEEN ? AND ?';
        params.push(startDate, endDate);
      } else if (startDate) {
        dateCondition = 'DATE(a.created_at) >= ?';
        params.push(startDate);
      } else if (endDate) {
        dateCondition = 'DATE(a.created_at) <= ?';
        params.push(endDate);
      }
      break;
  }

  return { condition: dateCondition, params };
};

// Get user overview statistics
router.get('/:id/overview', auth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const targetUserId = req.params.id;
    
    console.log('Fetching overview for user:', targetUserId, 'by user:', userId);

    const hasManagePermission = await hasPermission(userId, 'manage_user');

    // Allow users to view their own overview or if they have manage_user permission
    if (String(userId) !== String(targetUserId) && !hasManagePermission) {
      return res.status(403).json({ error: 'Access denied. You need manage_user permission to view other user overviews.' });
    }

    const { filter = 'all', start_date, end_date } = req.query;
    const { condition: dateCondition, params: dateParams } = buildDateFilter(filter, start_date, end_date);

    console.log('Date filter:', filter, 'Condition:', dateCondition, 'Params:', dateParams);

    // Get user details with role
    const [userDetails] = await db.query(`
      SELECT u.*, r.name as role_name 
      FROM users u 
      LEFT JOIN roles r ON u.role_id = r.id 
      WHERE u.id = ?
    `, [targetUserId]);

    if (userDetails.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userDetails[0];
    const isExecutive = user.role_name === 'Executive';

    console.log('User found:', user.name, 'Role:', user.role_name, 'Is Executive:', isExecutive);

    // Get clients statistics
    const clientQuery = `
      SELECT 
        COUNT(*) as total_clients,
        COUNT(CASE WHEN DATE(created_at) = CURDATE() THEN 1 END) as today_clients,
        COUNT(CASE WHEN created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY) THEN 1 END) as this_week_clients,
        COUNT(CASE WHEN MONTH(created_at) = MONTH(CURDATE()) AND YEAR(created_at) = YEAR(CURDATE()) THEN 1 END) as this_month_clients
      FROM clients 
      WHERE user_id = ?
    `;
    const [clientStats] = await db.query(clientQuery, [targetUserId]);

    console.log('Client stats:', clientStats[0]);

    // Get follow-up statistics
    const followupQuery = `
      SELECT 
        COUNT(*) as total_followups,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_followups,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_followups,
        COUNT(CASE WHEN status = 'canceled' THEN 1 END) as canceled_followups
      FROM activities a
      WHERE a.user_id = ? AND ${dateCondition}
    `;
    const [followupStats] = await db.query(followupQuery, [targetUserId, ...dateParams]);

    console.log('Followup stats:', followupStats[0]);

    // Get meeting statistics (only for executives)
    let meetingStats = { total_meetings: 0, completed_meetings: 0, pending_meetings: 0, canceled_meetings: 0 };
    if (isExecutive) {
      const meetingQuery = `
        SELECT 
          COUNT(*) as total_meetings,
          COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_meetings,
          COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_meetings,
          COUNT(CASE WHEN status = 'canceled' THEN 1 END) as canceled_meetings
        FROM activities a
        JOIN activity_types at ON a.type_id = at.id
        WHERE a.user_id = ? AND at.name = 'Meeting' AND ${dateCondition}
      `;
      const [meetingResult] = await db.query(meetingQuery, [targetUserId, ...dateParams]);
      meetingStats = meetingResult[0];
      console.log('Meeting stats:', meetingStats);
    }

    // Get leads data (clients without projects or recent activities)
    const leadsQuery = `
      SELECT 
        COUNT(*) as total_leads,
        COUNT(CASE WHEN DATE(c.created_at) = CURDATE() THEN 1 END) as today_leads,
        COUNT(CASE WHEN c.created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY) THEN 1 END) as this_week_leads,
        COUNT(CASE WHEN MONTH(c.created_at) = MONTH(CURDATE()) AND YEAR(c.created_at) = YEAR(CURDATE()) THEN 1 END) as this_month_leads
      FROM clients c
      WHERE c.user_id = ? 
      AND NOT EXISTS (SELECT 1 FROM projects p WHERE p.client_id = c.id)
    `;
    const [leadsStats] = await db.query(leadsQuery, [targetUserId]);

    // Get converted clients data (clients with projects)
    const convertedQuery = `
      SELECT 
        COUNT(*) as total_converted,
        COUNT(CASE WHEN DATE(c.created_at) = CURDATE() THEN 1 END) as today_converted,
        COUNT(CASE WHEN c.created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY) THEN 1 END) as this_week_converted,
        COUNT(CASE WHEN MONTH(c.created_at) = MONTH(CURDATE()) AND YEAR(c.created_at) = YEAR(CURDATE()) THEN 1 END) as this_month_converted
      FROM clients c
      WHERE c.user_id = ? 
      AND EXISTS (SELECT 1 FROM projects p WHERE p.client_id = c.id)
    `;
    const [convertedStats] = await db.query(convertedQuery, [targetUserId]);

    // Get activity trends for graphs (last 6 months)
    const trendsQuery = `
      SELECT 
        DATE_FORMAT(created_at, '%Y-%m') as month,
        COUNT(*) as count
      FROM activities
      WHERE user_id = ? AND created_at >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
      GROUP BY DATE_FORMAT(created_at, '%Y-%m')
      ORDER BY month
    `;
    const [activityTrends] = await db.query(trendsQuery, [targetUserId]);

    // Get client addition trends
    const clientTrendsQuery = `
      SELECT 
        DATE_FORMAT(created_at, '%Y-%m') as month,
        COUNT(*) as count
      FROM clients
      WHERE user_id = ? AND created_at >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
      GROUP BY DATE_FORMAT(created_at, '%Y-%m')
      ORDER BY month
    `;
    const [clientTrends] = await db.query(clientTrendsQuery, [targetUserId]);

    res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role_name: user.role_name,
        is_executive: isExecutive
      },
      clients: clientStats[0],
      followups: followupStats[0],
      meetings: meetingStats,
      leads: leadsStats[0],
      converted: convertedStats[0],
      trends: {
        activities: activityTrends,
        clients: clientTrends
      }
    });
  } catch (error) {
    console.error('Error fetching user overview:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get detailed data for tabs
router.get('/:id/overview/:tab', auth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const targetUserId = req.params.id;
    const tab = req.params.tab;
    const hasManagePermission = await hasPermission(userId, 'manage_user');

    if (String(userId) !== String(targetUserId) && !hasManagePermission) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    const { filter = 'all', start_date, end_date, page = 1, limit = 10 } = req.query;
    const { condition: dateCondition, params: dateParams } = buildDateFilter(filter, start_date, end_date);
    const offset = (page - 1) * limit;

    let data = [];
    let total = 0;

    switch (tab) {
      case 'clients':
        const clientsQuery = `
          SELECT c.*, i.name as industry_name
          FROM clients c
          LEFT JOIN industries i ON c.industry_id = i.id
          WHERE c.user_id = ? AND ${dateCondition}
          ORDER BY c.created_at DESC
          LIMIT ? OFFSET ?
        `;
        const [clientsData] = await db.query(clientsQuery, [targetUserId, ...dateParams, parseInt(limit), offset]);
        
        const clientsCountQuery = `
          SELECT COUNT(*) as total
          FROM clients c
          WHERE c.user_id = ? AND ${dateCondition}
        `;
        const [clientsCount] = await db.query(clientsCountQuery, [targetUserId, ...dateParams]);
        
        data = clientsData;
        total = clientsCount[0].total;
        break;

      case 'followups':
        const followupsQuery = `
          SELECT a.*, c.client_name, at.name as activity_type, cs.name as call_status
          FROM activities a
          JOIN clients c ON a.client_id = c.id
          JOIN activity_types at ON a.type_id = at.id
          LEFT JOIN call_status cs ON a.call_status_id = cs.id
          WHERE a.user_id = ? AND ${dateCondition}
          ORDER BY a.created_at DESC
          LIMIT ? OFFSET ?
        `;
        const [followupsData] = await db.query(followupsQuery, [targetUserId, ...dateParams, parseInt(limit), offset]);
        
        const followupsCountQuery = `
          SELECT COUNT(*) as total
          FROM activities a
          WHERE a.user_id = ? AND ${dateCondition}
        `;
        const [followupsCount] = await db.query(followupsCountQuery, [targetUserId, ...dateParams]);
        
        data = followupsData;
        total = followupsCount[0].total;
        break;

      case 'meetings':
        const meetingsQuery = `
          SELECT a.*, c.client_name, at.name as activity_type
          FROM activities a
          JOIN clients c ON a.client_id = c.id
          JOIN activity_types at ON a.type_id = at.id
          WHERE a.user_id = ? AND at.name = 'Meeting' AND ${dateCondition}
          ORDER BY a.created_at DESC
          LIMIT ? OFFSET ?
        `;
        const [meetingsData] = await db.query(meetingsQuery, [targetUserId, ...dateParams, parseInt(limit), offset]);
        
        const meetingsCountQuery = `
          SELECT COUNT(*) as total
          FROM activities a
          JOIN activity_types at ON a.type_id = at.id
          WHERE a.user_id = ? AND at.name = 'Meeting' AND ${dateCondition}
        `;
        const [meetingsCount] = await db.query(meetingsCountQuery, [targetUserId, ...dateParams]);
        
        data = meetingsData;
        total = meetingsCount[0].total;
        break;

      case 'leads':
        const leadsQuery = `
          SELECT c.*, i.name as industry_name
          FROM clients c
          LEFT JOIN industries i ON c.industry_id = i.id
          WHERE c.user_id = ? 
          AND NOT EXISTS (SELECT 1 FROM projects p WHERE p.client_id = c.id)
          AND ${dateCondition}
          ORDER BY c.created_at DESC
          LIMIT ? OFFSET ?
        `;
        const [leadsData] = await db.query(leadsQuery, [targetUserId, ...dateParams, parseInt(limit), offset]);
        
        const leadsCountQuery = `
          SELECT COUNT(*) as total
          FROM clients c
          WHERE c.user_id = ? 
          AND NOT EXISTS (SELECT 1 FROM projects p WHERE p.client_id = c.id)
          AND ${dateCondition}
        `;
        const [leadsCount] = await db.query(leadsCountQuery, [targetUserId, ...dateParams]);
        
        data = leadsData;
        total = leadsCount[0].total;
        break;

      default:
        return res.status(400).json({ error: 'Invalid tab' });
    }

    res.json({
      data,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching tab data:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

