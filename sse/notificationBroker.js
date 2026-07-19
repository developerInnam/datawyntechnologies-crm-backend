// Simple in-memory broker for SSE notifications.
// Note: This works per-process; if you run multiple backend instances, use Redis/pubsub.

class NotificationBroker {
  constructor() {
    this.listenersByUserId = new Map(); // userId -> Set<sendFn>
  }

  addListener(userId, sendFn) {
    if (!this.listenersByUserId.has(userId)) {
      this.listenersByUserId.set(userId, new Set());
    }
    this.listenersByUserId.get(userId).add(sendFn);
  }

  removeListener(userId, sendFn) {
    const set = this.listenersByUserId.get(userId);
    if (!set) return;
    set.delete(sendFn);
    if (set.size === 0) this.listenersByUserId.delete(userId);
  }

  publishToUser(userId, payload) {
    const set = this.listenersByUserId.get(userId);
    if (!set || set.size === 0) return;

    const data = JSON.stringify(payload);
    for (const sendFn of set) {
      try {
        sendFn(data);
      } catch (_) {
        // ignore individual send failures
      }
    }
  }
}

module.exports = new NotificationBroker();

