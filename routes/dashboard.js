const express = require('express');
const router = express.Router();
const db = require('../config/db');
const auth = require('../middleware/auth');

// Get dashboard statistics
router.get('/stats', auth, async (req, res) => {
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
    const userId = req.user.userId;

    let clientQuery, activityQuery, noteQuery, userQuery, activeUserQuery;
    let clientParams, activityParams, noteParams, userParams, activeUserParams;

    if (isAdmin) {
      // Admin: Get all statistics
      clientQuery = 'SELECT COUNT(*) as total, SUM(CASE WHEN is_converted = 1 THEN 1 ELSE 0 END) as converted FROM clients';
      clientParams = [];

      activityQuery = 'SELECT COUNT(*) as total, SUM(CASE WHEN status = "pending" THEN 1 ELSE 0 END) as pending FROM activities';
      activityParams = [];

      noteQuery = 'SELECT COUNT(*) as total FROM notes';
      noteParams = [];

      userQuery = 'SELECT COUNT(*) as total FROM users';
      userParams = [];

      activeUserQuery = 'SELECT COUNT(*) as total FROM users WHERE LOWER(status) IN ("active","live")';
      activeUserParams = [];
    } else {
      // Non-admin: Get statistics for own data only
      clientQuery = 'SELECT COUNT(*) as total, SUM(CASE WHEN is_converted = 1 THEN 1 ELSE 0 END) as converted FROM clients WHERE user_id = ?';
      clientParams = [userId];

      activityQuery = 'SELECT COUNT(*) as total, SUM(CASE WHEN status = "pending" THEN 1 ELSE 0 END) as pending FROM activities WHERE user_id = ?';
      activityParams = [userId];

      noteQuery = 'SELECT COUNT(*) as total FROM notes WHERE user_id = ?';
      noteParams = [userId];

      // Users count is only for admins
      userQuery = 'SELECT 0 as total';
      userParams = [];

      activeUserQuery = 'SELECT 0 as total';
      activeUserParams = [];
    }

    const [clients] = await db.query(clientQuery, clientParams);
    const [activities] = await db.query(activityQuery, activityParams);
    const [notes] = await db.query(noteQuery, noteParams);
    const [users] = await db.query(userQuery, userParams);
    const [activeUsers] = await db.query(activeUserQuery, activeUserParams);

    res.json({
      clients: clients[0].total || 0,
      convertedClients: clients[0].converted || 0,
      followups: activities[0].total || 0,
      pendingFollowups: activities[0].pending || 0,
      notes: notes[0].total || 0,
      users: users[0].total || 0,
      activeUsers: activeUsers[0].total || 0
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get users list for admin dashboard
router.get('/users', auth, async (req, res) => {
  try {
    // Any authenticated user can select executives.
    // We still restrict the returned list to executives only.
    const isAdmin = req.user.role === 'Admin' || req.user.role_id === 1;

    const [rows] = await db.query(`
      SELECT u.id, u.name, u.email, u.phone, u.status, r.name as role_name
      FROM users u
      LEFT JOIN roles r ON u.role_id = r.id
      WHERE LOWER(r.name) = 'executive'
      ORDER BY u.created_at DESC
    `);

    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get dashboard meetings (Today / Upcoming / Previous / Previous Completed / Previous Canceled)
router.get('/meetings', auth, async (req, res) => {
  try {
    const isAdmin = req.user.role === 'Admin' || req.user.role_id === 1;
    const userId = req.user.userId;

    const meetingTypeName = 'meeting';

    // Today
    const todayQuery = `
      SELECT a.*, c.company_name, c.client_name, c.mobile, c.email,
             u.name as user_name,
             at.name as type_name,
             cs.name as call_status_name,
             DATE_FORMAT(a.follow_up_date, '%Y-%m-%d') as follow_up_date_day
      FROM activities a
      LEFT JOIN clients c ON a.client_id = c.id
      LEFT JOIN users u ON a.user_id = u.id
      LEFT JOIN activity_types at ON a.type_id = at.id
      LEFT JOIN call_status cs ON a.call_status_id = cs.id
      WHERE at.name = ?
        AND a.follow_up_date IS NOT NULL
        AND DATE(a.follow_up_date) = CURDATE()
        ${isAdmin ? '' : 'AND a.user_id = ?'}
      ORDER BY a.follow_up_date ASC, a.created_at DESC
    `;

    // Upcoming (tomorrow+)
    const upcomingQuery = `
      SELECT a.*, c.company_name, c.client_name, c.mobile, c.email,
             u.name as user_name,
             at.name as type_name,
             cs.name as call_status_name,
             DATE_FORMAT(a.follow_up_date, '%Y-%m-%d') as follow_up_date_day
      FROM activities a
      LEFT JOIN clients c ON a.client_id = c.id
      LEFT JOIN users u ON a.user_id = u.id
      LEFT JOIN activity_types at ON a.type_id = at.id
      LEFT JOIN call_status cs ON a.call_status_id = cs.id
      WHERE at.name = ?
        AND a.follow_up_date IS NOT NULL
        AND DATE(a.follow_up_date) > CURDATE()
        ${isAdmin ? '' : 'AND a.user_id = ?'}
      ORDER BY a.follow_up_date ASC, a.created_at DESC
    `;

    // Previous (before today, excluding completed)
    const previousQuery = `
      SELECT a.*, c.company_name, c.client_name, c.mobile, c.email,
             u.name as user_name,
             at.name as type_name,
             cs.name as call_status_name,
             DATE_FORMAT(a.follow_up_date, '%Y-%m-%d') as follow_up_date_day
      FROM activities a
      LEFT JOIN clients c ON a.client_id = c.id
      LEFT JOIN users u ON a.user_id = u.id
      LEFT JOIN activity_types at ON a.type_id = at.id
      LEFT JOIN call_status cs ON a.call_status_id = cs.id
      WHERE at.name = ?
        AND a.follow_up_date IS NOT NULL
        AND DATE(a.follow_up_date) < CURDATE()
        AND a.status != 'completed'
        ${isAdmin ? '' : 'AND a.user_id = ?'}
      ORDER BY a.follow_up_date DESC, a.created_at DESC
    `;

    // Previous Completed (before today, status completed)
    const previousCompletedQuery = `
      SELECT a.*, c.company_name, c.client_name, c.mobile, c.email,
             u.name as user_name,
             at.name as type_name,
             cs.name as call_status_name,
             DATE_FORMAT(a.follow_up_date, '%Y-%m-%d') as follow_up_date_day
      FROM activities a
      LEFT JOIN clients c ON a.client_id = c.id
      LEFT JOIN users u ON a.user_id = u.id
      LEFT JOIN activity_types at ON a.type_id = at.id
      LEFT JOIN call_status cs ON a.call_status_id = cs.id
      WHERE at.name = ?
        AND a.follow_up_date IS NOT NULL
        AND DATE(a.follow_up_date) < CURDATE()
        AND a.status = 'completed'
        ${isAdmin ? '' : 'AND a.user_id = ?'}
      ORDER BY a.follow_up_date DESC, a.created_at DESC
    `;

    // Previous Canceled (before today, status canceled)
    const previousCanceledQuery = `
      SELECT a.*, c.company_name, c.client_name, c.mobile, c.email,
             u.name as user_name,
             at.name as type_name,
             cs.name as call_status_name,
             DATE_FORMAT(a.follow_up_date, '%Y-%m-%d') as follow_up_date_day
      FROM activities a
      LEFT JOIN clients c ON a.client_id = c.id
      LEFT JOIN users u ON a.user_id = u.id
      LEFT JOIN activity_types at ON a.type_id = at.id
      LEFT JOIN call_status cs ON a.call_status_id = cs.id
      WHERE at.name = ?
        AND a.follow_up_date IS NOT NULL
        AND DATE(a.follow_up_date) < CURDATE()
        AND a.status = 'canceled'
        ${isAdmin ? '' : 'AND a.user_id = ?'}
      ORDER BY a.follow_up_date DESC, a.created_at DESC
    `;

    const todayParams = isAdmin ? [meetingTypeName] : [meetingTypeName, userId];
    const upcomingParams = isAdmin ? [meetingTypeName] : [meetingTypeName, userId];
    const previousParams = isAdmin ? [meetingTypeName] : [meetingTypeName, userId];
    const previousCompletedParams = isAdmin ? [meetingTypeName] : [meetingTypeName, userId];
    const previousCanceledParams = isAdmin ? [meetingTypeName] : [meetingTypeName, userId];

    const [todayRows] = await db.query(todayQuery, todayParams);
    const [upcomingRows] = await db.query(upcomingQuery, upcomingParams);
    const [previousRows] = await db.query(previousQuery, previousParams);
    const [previousCompletedRows] = await db.query(previousCompletedQuery, previousCompletedParams);
    const [previousCanceledRows] = await db.query(previousCanceledQuery, previousCanceledParams);

    res.json({
      todayMeetings: todayRows,
      upcomingMeetings: upcomingRows,
      previousMeetings: previousRows,
      previousCompletedMeetings: previousCompletedRows,
      previousCanceledMeetings: previousCanceledRows,
    });
  } catch (error) {
    console.error("❌ Meetings API Error:", error);

    res.status(500).json({
      success: false,
      message: error.message,
      code: error.code,
      sqlMessage: error.sqlMessage,
      sql: error.sql,
      stack: process.env.NODE_ENV !== "production" ? error.stack : undefined,
    });
  }
});


// Get monthly statistics
router.get('/monthly-stats', auth, async (req, res) => {
  try {
    const { month } = req.query;
    const isAdmin = req.user.role === 'Admin' || req.user.role_id === 1;
    const userId = req.user.userId;
    const currentYear = new Date().getFullYear();

    let clientQuery, activityQuery, noteQuery;
    let clientParams, activityParams, noteParams;

    if (isAdmin) {
      // Admin: Get monthly statistics for all data
      clientQuery = `
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN is_converted = 1 THEN 1 ELSE 0 END) as converted,
          DATE_FORMAT(created_at, '%Y-%m') as month
        FROM clients
        WHERE YEAR(created_at) = ? AND MONTH(created_at) = ?
        GROUP BY DATE_FORMAT(created_at, '%Y-%m')
      `;
      clientParams = [currentYear, month];

      activityQuery = `
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
          DATE_FORMAT(created_at, '%Y-%m') as month
        FROM activities
        WHERE YEAR(created_at) = ? AND MONTH(created_at) = ?
        GROUP BY DATE_FORMAT(created_at, '%Y-%m')
      `;
      activityParams = [currentYear, month];

      noteQuery = `
        SELECT 
          COUNT(*) as total,
          DATE_FORMAT(created_at, '%Y-%m') as month
        FROM notes
        WHERE YEAR(created_at) = ? AND MONTH(created_at) = ?
        GROUP BY DATE_FORMAT(created_at, '%Y-%m')
      `;
      noteParams = [currentYear, month];
    } else {
      // Non-admin: Get monthly statistics for own data only
      clientQuery = `
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN is_converted = 1 THEN 1 ELSE 0 END) as converted,
          DATE_FORMAT(created_at, '%Y-%m') as month
        FROM clients
        WHERE user_id = ? AND YEAR(created_at) = ? AND MONTH(created_at) = ?
        GROUP BY DATE_FORMAT(created_at, '%Y-%m')
      `;
      clientParams = [userId, currentYear, month];

      activityQuery = `
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
          DATE_FORMAT(created_at, '%Y-%m') as month
        FROM activities
        WHERE user_id = ? AND YEAR(created_at) = ? AND MONTH(created_at) = ?
        GROUP BY DATE_FORMAT(created_at, '%Y-%m')
      `;
      activityParams = [userId, currentYear, month];

      noteQuery = `
        SELECT 
          COUNT(*) as total,
          DATE_FORMAT(created_at, '%Y-%m') as month
        FROM notes
        WHERE user_id = ? AND YEAR(created_at) = ? AND MONTH(created_at) = ?
        GROUP BY DATE_FORMAT(created_at, '%Y-%m')
      `;
      noteParams = [userId, currentYear, month];
    }

    const [clients] = await db.query(clientQuery, clientParams);
    const [activities] = await db.query(activityQuery, activityParams);
    const [notes] = await db.query(noteQuery, noteParams);

    // Get month name
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'];
    const monthName = monthNames[parseInt(month) - 1];

    res.json([{
      month: monthName,
      clients: clients[0]?.total || 0,
      convertedClients: clients[0]?.converted || 0,
      followups: activities[0]?.total || 0,
      pendingFollowups: activities[0]?.pending || 0,
      notes: notes[0]?.total || 0
    }]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

