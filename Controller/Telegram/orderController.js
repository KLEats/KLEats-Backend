const db = require("../../Config/mysqlDb.js");
const redis = require('../../Config/redisClint');
const { getCanteenTelegramIds } = require('../../Services/telegram');
const getKeyRedis = require('../../Services/Helper/GetKeysRedis');

function pick(param, fallback) {
  return (param !== undefined && param !== null) ? param : fallback;
}

function norm(s = '') {
  return String(s || '').trim();
}

const ALLOWED_PAYMENT = new Set([
  'PENDING','CHARGED','FAILED','CANCELLED','REFUNDED','ACTIVE',
  'PENDING_VBV','AUTHENTICATION_FAILED','AUTHORIZATION_FAILED','EXPIRED','PARTIAL_REFUNDED','PAYMENT_PENDING','PAID','DELIVERED'
]);

// GET/POST /api/telegram/order/action
// Query/body: transactionId (required), action=DELIVERED|REFUND or paymentStatus=...
// Auth: telegramId required and must be present in the canteen's Data/<canteenId>.json.telegramIds
async function orderAction(req, res) {
  const q = req.method === 'GET' ? req.query : req.body || {};
  const transactionId = norm(q.transactionId || q.order_id || q.tid);
  const action = norm(q.action || q.a).toUpperCase();
  const telegramId = norm(q.telegramId || q.from || q.chatId);
  const paymentStatusRaw = norm(q.paymentStatus || q.status).toUpperCase();

  if (!transactionId) return res.status(400).json({ code: 0, message: 'transactionId required' });
  if (!telegramId) return res.status(401).json({ code: 0, message: 'telegramId required' });

  let conn;
  try {
    conn = await db.getConnection();
    const [rows] = await conn.query(
      'SELECT orderId, canteenId, userId, status, paymentStatus, deliveryTime FROM orders WHERE transactionId = ? LIMIT 1',
      [transactionId]
    );
    if (!rows.length) return res.status(404).json({ code: 0, message: 'Order not found' });
    const order = rows[0];

    // AuthZ via telegramId whitelist from canteen JSON
    const ids = getCanteenTelegramIds(order.canteenId) || [];
    if (!ids.map(String).includes(telegramId)) {
      return res.status(403).json({ code: 0, message: 'Not authorized for this canteen' });
    }

    // Decide update
    let didUpdate = false;
  if (action === 'DELIVERED') {
      await conn.query(
        `UPDATE orders
      SET status = 'delivered',
        deliveryTime = NOW(),
        paymentStatus = 'DELIVERED'
          WHERE transactionId = ? AND canteenId = ?`,
        [transactionId, order.canteenId]
      );
      didUpdate = true;
    } else if (action === 'REFUND' || action === 'REFUNDED') {
      await conn.query(
        `UPDATE orders
            SET paymentStatus = 'REFUNDED', status = CASE WHEN status IS NULL OR status='' THEN status ELSE status END
          WHERE transactionId = ? AND canteenId = ?`,
        [transactionId, order.canteenId]
      );
      didUpdate = true;
    } else if (paymentStatusRaw) {
      if (!ALLOWED_PAYMENT.has(paymentStatusRaw)) {
        return res.status(400).json({ code: 0, message: 'Invalid paymentStatus', allowed: Array.from(ALLOWED_PAYMENT) });
      }
      await conn.query(
        `UPDATE orders SET paymentStatus = ? WHERE transactionId = ? AND canteenId = ?`,
        [paymentStatusRaw, transactionId, order.canteenId]
      );
      didUpdate = true;
    } else {
      return res.status(400).json({ code: 0, message: 'Provide action=DELIVERED|REFUND or paymentStatus' });
    }

    if (didUpdate) {
      await conn.commit();
      try {
        await redis.del(getKeyRedis('canteenOrders', order.canteenId));
        if (order.userId) await redis.del(getKeyRedis('userOrders', order.userId));
      } catch (_) {}

      // Try to edit all sent messages for this order (if map exists)
      try {
        const mapKey = getKeyRedis('tg_msgmap', transactionId);
        const json = await redis.get(mapKey);
        const entries = json ? JSON.parse(json) : [];
        const statusText = action === 'DELIVERED' ? '\n\n✅ <b>Delivered</b>' : (action === 'REFUND' || action === 'REFUNDED') ? '\n\n↩️ <b>Refunded</b>' : '';
        const { editMessageText } = require('../../Services/telegram');
        for (const m of entries) {
          try {
            // We don't have original text here; let Telegram append status by reusing current text is tricky.
            // So we just remove buttons and append badge; we need message text—skip if missing.
            // As a simple approach, send a small confirmation message to the chat.
            await editMessageText(m.chatId, m.messageId, `${order.transactionId} ${statusText}`.trim(), { reply_markup: { inline_keyboard: [] } });
          } catch (e) {
            if (process.env.TELEGRAM_DEBUG==='true') console.warn('Edit fail', m.chatId, m.messageId, e.response?.data || e.message);
          }
        }
      } catch (_) {}
    }

    return res.json({ code: 1, message: 'Updated', orderId: order.orderId, transactionId, canteenId: order.canteenId, action: action || undefined, paymentStatus: paymentStatusRaw || undefined });
  } catch (err) {
    if (conn) await conn.rollback();
    console.error('telegram orderAction error:', err);
    return res.status(500).json({ code: -1, message: 'Internal Server Error' });
  } finally {
    if (conn) conn.release();
  }
}

module.exports = { orderAction };
