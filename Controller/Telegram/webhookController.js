const db = require("../../Config/mysqlDb.js");
const redis = require('../../Config/redisClint');
const { getCanteenTelegramIds, editMessageText, answerCallbackQuery } = require('../../Services/telegram');
const getKeyRedis = require('../../Services/Helper/GetKeysRedis');

// Helper to normalize strings
function norm(s = '') { return String(s || '').trim(); }

// Edits message text to append a clear status badge
function addStatusBadge(original, statusText) {
  const badge = statusText === 'DELIVERED' ? '\n\n✅ <b>Delivered</b>' : '\n\n↩️ <b>Refunded</b>';
  if (!original) return badge.trim();
  // Avoid duplicating badges
  if (/Delivered|Refunded/i.test(original)) return original;
  return original + badge;
}

// POST /telegram/webhook - Telegram will hit this with updates
async function telegramWebhook(req, res) {
  try {
    const update = req.body || {};
    if (!update.callback_query) {
      return res.json({ ok: true });
    }
    const cq = update.callback_query;
    const fromId = String(cq.from?.id || '');
    const message = cq.message || {};
    const chatId = message.chat?.id;
    const messageId = message.message_id;
    const data = String(cq.data || ''); // expected format: oa|ACTION|transactionId

    if (!data.startsWith('oa|')) {
      await answerCallbackQuery(cq.id, 'Unsupported action');
      return res.json({ ok: true });
    }
    const parts = data.split('|');
    const action = norm(parts[1] || '').toUpperCase();
    const transactionId = norm(parts[2] || '');
    if (!transactionId) {
      await answerCallbackQuery(cq.id, 'Missing order id');
      return res.json({ ok: true });
    }

    let conn;
    try {
      conn = await db.getConnection();
      const [rows] = await conn.query(
        'SELECT orderId, canteenId, userId, status, paymentStatus FROM orders WHERE transactionId = ? LIMIT 1',
        [transactionId]
      );
      if (!rows.length) {
        await answerCallbackQuery(cq.id, 'Order not found', true);
        return res.json({ ok: true });
      }
      const order = rows[0];

      // authorize via canteen telegram ids
      const allowed = getCanteenTelegramIds(order.canteenId).map(String);
      if (!allowed.includes(fromId)) {
        await answerCallbackQuery(cq.id, 'Not authorized', true);
        return res.json({ ok: true });
      }

    if (action === 'DELIVERED') {
        await conn.query(
<<<<<<< HEAD
      `UPDATE orders SET status='delivered', deliveryTime = NOW(), paymentStatus='DELIVERED' WHERE transactionId = ? AND canteenId = ?`,
=======
      `UPDATE orders SET status='delivered', deliveryTime = NOW() WHERE transactionId = ? AND canteenId = ?`,
>>>>>>> ce735365d6832a60de1ab0dcedab42e944a3684c
          [transactionId, order.canteenId]
        );
      } else if (action === 'REFUND' || action === 'REFUNDED') {
        await conn.query(
          `UPDATE orders SET paymentStatus='REFUNDED',status='REFUNDED' WHERE transactionId = ? AND canteenId = ?`,
          [transactionId, order.canteenId]
        );
      } else {
        await answerCallbackQuery(cq.id, 'Unknown action', true);
        return res.json({ ok: true });
      }

      // invalidate caches
      try {
        await redis.del(getKeyRedis('canteenOrders', order.canteenId));
        if (order.userId) await redis.del(getKeyRedis('userOrders', order.userId));
      } catch (_) {}

      // edit this message
      const newText = addStatusBadge(message.text || message.caption || '', action);
      const replyMarkup = { reply_markup: { inline_keyboard: [] } }; // remove buttons
      try { await editMessageText(chatId, messageId, newText, replyMarkup); } catch (e) {
        if (process.env.TELEGRAM_DEBUG === 'true') console.warn('Edit self failed', e.response?.data || e.message);
      }

      // also edit all other sent copies (if we stored them)
      try {
        const mapKey = getKeyRedis('tg_msgmap', transactionId);
        const json = await redis.get(mapKey);
        const entries = json ? JSON.parse(json) : [];
        for (const m of entries) {
          if (String(m.chatId) === String(chatId) && Number(m.messageId) === Number(messageId)) continue;
          try { await editMessageText(m.chatId, m.messageId, newText, replyMarkup); } catch (e) {
            if (process.env.TELEGRAM_DEBUG === 'true') console.warn('Edit other failed', e.response?.data || e.message);
          }
        }
      } catch (_) {}

      await answerCallbackQuery(cq.id, action === 'DELIVERED' ? 'Marked delivered' : 'Refund noted');
    } finally {
      if (conn) conn.release();
    }

    return res.json({ ok: true });
  } catch (e) {
    console.error('telegram webhook error:', e);
    return res.json({ ok: true });
  }
}

module.exports = { telegramWebhook };
