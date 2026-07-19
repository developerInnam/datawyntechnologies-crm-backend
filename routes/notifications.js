const express = require('express');
const router = express.Router();
const db = require('../config/db');
const auth = require('../middleware/auth');

// Get all notifications for the current user
router.get('/', auth, async (req, res) => {
  try {
    const userId = req.user.userId;

    const [notifications] = await db.query(`
      SELECT * FROM notifications
      WHERE user_id = ?
      ORDER BY created_at DESC
    `, [userId]);

    res.json(notifications);
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get unread notifications count
router.get('/unread-count', auth, async (req, res) => {
  try {
    const userId = req.user.userId;

    const [result] = await db.query(`
      SELECT COUNT(*) as count FROM notifications
      WHERE user_id = ? AND is_read = FALSE
    `, [userId]);

    res.json({ count: result[0].count });
  } catch (error) {
    console.error('Error fetching unread count:', error);
    res.status(500).json({ error: error.message });
  }
});

// Mark notification as read
router.put('/:id/read', auth, async (req, res) => {
  try {
    const notificationId = req.params.id;
    const userId = req.user.userId;

    // Verify the notification belongs to the user
    const [notifications] = await db.query(`
      SELECT * FROM notifications WHERE id = ? AND user_id = ?
    `, [notificationId, userId]);

    if (notifications.length === 0) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    await db.query(`
      UPDATE notifications SET is_read = TRUE WHERE id = ?
    `, [notificationId]);

    res.json({ message: 'Notification marked as read' });
  } catch (error) {
    console.error('Error marking notification as read:', error);
    res.status(500).json({ error: error.message });
  }
});

// Mark all notifications as read
router.put('/mark-all-read', auth, async (req, res) => {
  try {
    const userId = req.user.userId;

    await db.query(`
      UPDATE notifications SET is_read = TRUE WHERE user_id = ?
    `, [userId]);

    res.json({ message: 'All notifications marked as read' });
  } catch (error) {
    console.error('Error marking all notifications as read:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete all notifications
router.delete('/', auth, async (req, res) => {
  try {
    const userId = req.user.userId;

    await db.query(`
      DELETE FROM notifications WHERE user_id = ?
    `, [userId]);

    res.json({ message: 'All notifications deleted' });
  } catch (error) {
    console.error('Error deleting all notifications:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete notification
router.delete('/:id', auth, async (req, res) => {
  try {
    const notificationId = req.params.id;
    const userId = req.user.userId;

    // Verify the notification belongs to the user
    const [notifications] = await db.query(`
      SELECT * FROM notifications WHERE id = ? AND user_id = ?
    `, [notificationId, userId]);

    if (notifications.length === 0) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    await db.query(`
      DELETE FROM notifications WHERE id = ?
    `, [notificationId]);

    res.json({ message: 'Notification deleted' });
  } catch (error) {
    console.error('Error deleting notification:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
