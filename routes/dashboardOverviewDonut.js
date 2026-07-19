const express = require('express');
const router = express.Router();
const db = require('../config/db');
const auth = require('../middleware/auth');

// Overview Donut Chart data
// Returns labels + series for ApexCharts donut.
// Currently uses: activities status distribution.
// Dashboard overview donut charts
// - overview-donut: activities status distribution (existing)
// - overview-donut-counts: followups / meetings / leads counts (for multi-donut)

router.get('/overview-donut', auth, async (req, res) => {
  try {
    const isAdmin = req.user?.role === 'Admin' || req.user?.role_id === 1;
    const userId = req.user?.userId;

    // For safety: non-admin requests must have a valid userId.
    if (!isAdmin && (userId === undefined || userId === null || userId === '')) {
      return res.status(400).json({ error: 'Missing userId for non-admin donut request' });
    }

    // Keep the same overdue handling as /dashboard/stats:
    // pending overdue are auto-canceled before computing donut.
    // This should not break the donut itself, so treat it as non-fatal.
    try {
      await db.query(
        "UPDATE activities SET status = 'canceled' WHERE status = 'pending' AND DATE(follow_up_date) < CURDATE()"
      );
    } catch (updateError) {
      console.error('[overview-donut] Update overdue pending -> canceled failed:', updateError?.message);
      // continue to compute donut
    }

    const baseWhere = isAdmin ? '' : 'WHERE a.user_id = ?';
    const params = isAdmin ? [] : [userId];


    const query = `
      SELECT
        a.status as label,
        COUNT(*) as value
      FROM activities a
      ${baseWhere}
      GROUP BY a.status
    `;

    const [rows] = await db.query(query, params);

    // NOTE: This endpoint is currently returning activities status distribution.
    // It will be updated later to return dashboard card totals.
    // Stable ordering for UI.
    const order = ['pending', 'completed', 'canceled'];
    const map = new Map((rows || []).map((r) => [String(r.label).toLowerCase(), Number(r.value) || 0]));

    const labels = order.filter((k) => map.has(k));
    const series = labels.map((k) => map.get(k));

    // If there are no rows (empty DB), return empty but valid arrays.
    res.json({
      labels,
      series,
    });
  } catch (error) {
    console.error('[overview-donut] Fatal error:', error?.message);
    console.error(error);
    res.status(500).json({ error: error?.message || 'Unknown error' });
  }
});


// Followups / Meetings / Leads counts for dashboard donut charts
// Returns: { followupsTotal, meetingsTotal, leadsTotal }
router.get('/overview-donut-counts', auth, async (req, res) => {
  try {
    const isAdmin = req.user?.role === 'Admin' || req.user?.role_id === 1;
    const userId = req.user?.userId;

    if (!isAdmin && (userId === undefined || userId === null || userId === '')) {
      return res.status(400).json({ error: 'Missing userId for non-admin donut counts request' });
    }

    // Meetings are activities where activity_types.name = 'meeting'
    // Followups are all activities with follow_up_date IS NOT NULL
    // Leads are clients

    const activityParams = isAdmin ? [] : [userId];
    console.log('[overview-donut-counts] request', { isAdmin, userId });


    const followupWhere = isAdmin ? '' : 'WHERE a.user_id = ?';

    const [followupRows] = await db.query(
      `SELECT COUNT(*) as total
       FROM activities a
       ${followupWhere}
       AND a.follow_up_date IS NOT NULL`,
      activityParams
    );

    const [meetingsRows] = await db.query(
      `SELECT COUNT(*) as total
       FROM activities a
       INNER JOIN activity_types at ON a.type_id = at.id
       WHERE at.name = 'meeting'
       ${isAdmin ? '' : 'AND a.user_id = ?'}`,
      activityParams
    );

    const [leadsRows] = await db.query(
      `SELECT COUNT(*) as total
       FROM clients
       ${isAdmin ? '' : 'WHERE user_id = ?'}`,
      activityParams
    );



    res.json({
      followupsTotal: followupRows?.[0]?.total || 0,
      meetingsTotal: meetingsRows?.[0]?.total || 0,
      leadsTotal: leadsRows?.[0]?.total || 0,
    });
  } catch (error) {
    console.error('[overview-donut-counts] Fatal error:', {
      message: error?.message,
      stack: error?.stack,
      code: error?.code,
      errno: error?.errno,
      sqlMessage: error?.sqlMessage,
      sqlState: error?.sqlState,
      sql: error?.sql,
      sqlText: error?.sqlText,
      details: error,
    });

    // Return error details (frontend dev only) so we can see the real cause quickly
    res.status(500).json({
      error: error?.message || 'Unknown error',
      debug: {
        code: error?.code,
        errno: error?.errno,
        sqlMessage: error?.sqlMessage,
        sqlState: error?.sqlState,
      },
    });
  }
});


module.exports = router;




