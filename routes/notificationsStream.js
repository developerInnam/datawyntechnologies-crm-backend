const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const db = require('../config/db');
const broker = require('../sse/notificationBroker');

// SSE: stream new notifications for the current user.
// Client should reconnect automatically using EventSource.
router.get('/stream', auth, async (req, res) => {
  const userId = req.user.userId;

  // SSE headers
  res.status(200);
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
  });

  // If your reverse proxy buffers responses, you may need:
  // res.set('X-Accel-Buffering', 'no');

  // Flush headers
  res.flushHeaders?.();

  // Send initial comment to establish connection
  res.write(`: connected\n\n`);

  // If client provides lastEventId, we can filter.
  // However DB schema doesn't store event ids; we'll just notify and let client refetch.
  const sendFn = (data) => {
    res.write(`event: notification\n`);
    res.write(`data: ${data}\n\n`);
  };

  broker.addListener(userId, sendFn);


  // Tell client to re-fetch after we connect (useful if missed events)
  sendFn(JSON.stringify({ kind: 'reconnect' }));

  // Heartbeat to keep connection alive

  const interval = setInterval(() => {
    try {
      res.write(`event: ping\n`);
      res.write(`data: {}\n\n`);
    } catch (_) {
      // ignore
    }
  }, 25000);

  req.on('close', () => {
    clearInterval(interval);
    broker.removeListener(userId, sendFn);
  });

  // Also send currently unread count as the first payload (optional)
  try {
    const [result] = await db.query(
      `SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = FALSE`,
      [userId]
    );

    sendFn(
      JSON.stringify({
        kind: 'unread-count',
        count: result[0]?.count ?? 0,
      })
    );
  } catch (_) {
    // ignore
  }
  // NOTE: We intentionally do not send the notification list here; frontend will refetch on events.

});

module.exports = router;

