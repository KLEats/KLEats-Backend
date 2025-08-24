const db = require("../../Config/mysqlDb.js");
const redis = require('../../Config/redisClint');
const getKeyRedis = require('../../Services/Helper/GetKeysRedis');

function safeParse(val) {
  try {
    if (val == null) return null;
    if (Buffer.isBuffer(val)) return JSON.parse(val.toString("utf8"));
    if (typeof val === "string") return JSON.parse(val);
    if (typeof val === "object") return val; // already parsed
  } catch (_) {}
  return null;
}

// GET /api/Canteen/order/list?offset=0&limit=50
// Auth: Canteen JWT (verifyUserToken middleware). Uses req.payload.CanteenId
async function listOrders(req, res) {
  const payload = req.payload || {};
  const canteenId = payload.CanteenId;
  if (!canteenId) {
    return res.status(401).json({ code: -1, message: "Not authenticated (canteen)" });
  }

  const limit = Math.min(Math.max(parseInt(req.query.limit || '50', 10), 1), 100);
  const offset = Math.max(parseInt(req.query.offset || '0', 10), 0);

  let conn;
  try {
    conn = await db.getConnection();
    const [rows] = await conn.query(
      `SELECT orderId, transactionId, status, canteenId, orderTime, deliveryTime,
              userId, items, orderType, parcelPrice, paymentStatus
         FROM orders
        WHERE canteenId = ?
        ORDER BY orderId DESC
        LIMIT ? OFFSET ?`,
      [canteenId, limit, offset]
    );

    const data = rows.map(r => {
      const parsedItems = safeParse(r.items);
      return {
        orderId: r.orderId,
        transactionId: r.transactionId,
        status: r.status || 'pending',
        canteenId: r.canteenId,
        orderTime: r.orderTime,
        deliveryTime: r.deliveryTime,
        userId: r.userId,
        items: parsedItems ?? r.items,
        orderType: r.orderType || 'dinein',
        parcelPrice: Number(r.parcelPrice || 0),
        paymentStatus: r.paymentStatus || 'PENDING'
      };
    });

    // total count for pagination
    const [[meta]] = await conn.query(
      'SELECT COUNT(*) AS count FROM orders WHERE canteenId = ?',
      [canteenId]
    );

    return res.json({
      code: 1,
      meta: {
        totalCount: meta.count || 0,
        offset,
        limit,
        hasMore: offset + data.length < (meta.count || 0)
      },
      orders: data
    });
  } catch (err) {
    console.error('Canteen listOrders error:', err);
    return res.status(500).json({ code: -1, message: 'Internal Server Error' });
  } finally {
    if (conn) conn.release();
  }
}

module.exports = { listOrders };
async function listPaidOrders(req, res) {
  const payload = req.payload || {};
  const canteenId = payload.CanteenId;
  if (!canteenId) return res.status(401).json({ code: -1, message: 'Not authenticated (canteen)' });

  const limit = Math.min(Math.max(parseInt(req.query.limit || '50', 10), 1), 100);
  const offset = Math.max(parseInt(req.query.offset || '0', 10), 0);

  let conn;
  try {
    conn = await db.getConnection();
    const [rows] = await conn.query(
      `SELECT orderId, transactionId, status, canteenId, orderTime, deliveryTime,
              userId, items, orderType, parcelPrice, paymentStatus
         FROM orders
        WHERE canteenId = ? AND UPPER(paymentStatus) IN ('CHARGED','PAID')
        ORDER BY orderId DESC
        LIMIT ? OFFSET ?`,
      [canteenId, limit, offset]
    );

    const data = rows.map(r => ({
      orderId: r.orderId,
      transactionId: r.transactionId,
      status: r.status || 'pending',
      canteenId: r.canteenId,
      orderTime: r.orderTime,
      deliveryTime: r.deliveryTime,
      userId: r.userId,
      items: safeParse(r.items) ?? r.items,
      orderType: r.orderType || 'dinein',
      parcelPrice: Number(r.parcelPrice || 0),
      paymentStatus: r.paymentStatus || 'PENDING'
    }));

    const [[meta]] = await conn.query(
      `SELECT COUNT(*) AS count FROM orders WHERE canteenId = ? AND UPPER(paymentStatus) IN ('CHARGED','PAID')`,
      [canteenId]
    );

    return res.json({
      code: 1,
      meta: { totalCount: meta.count || 0, offset, limit, hasMore: offset + data.length < (meta.count || 0) },
      orders: data,
    });
  } catch (err) {
    console.error('Canteen listPaidOrders error:', err);
    return res.status(500).json({ code: -1, message: 'Internal Server Error' });
  } finally {
    if (conn) conn.release();
  }
}

async function listDeliveredOrders(req, res) {
  const payload = req.payload || {};
  const canteenId = payload.CanteenId;
  if (!canteenId) return res.status(401).json({ code: -1, message: 'Not authenticated (canteen)' });

  const limit = Math.min(Math.max(parseInt(req.query.limit || '50', 10), 1), 100);
  const offset = Math.max(parseInt(req.query.offset || '0', 10), 0);

  let conn;
  try {
    conn = await db.getConnection();
  const [rows] = await conn.query(
      `SELECT orderId, transactionId, status, canteenId, orderTime, deliveryTime,
              userId, items, orderType, parcelPrice, paymentStatus
         FROM orders
    WHERE canteenId = ? AND LOWER(status) = 'delivered' AND UPPER(paymentStatus) = 'DELIVERED'
        ORDER BY orderId DESC
        LIMIT ? OFFSET ?`,
      [canteenId, limit, offset]
    );

    const data = rows.map(r => ({
      orderId: r.orderId,
      transactionId: r.transactionId,
      status: r.status || 'pending',
      canteenId: r.canteenId,
      orderTime: r.orderTime,
      deliveryTime: r.deliveryTime,
      userId: r.userId,
      items: safeParse(r.items) ?? r.items,
      orderType: r.orderType || 'dinein',
      parcelPrice: Number(r.parcelPrice || 0),
      paymentStatus: r.paymentStatus || 'PENDING'
    }));

    const [[meta]] = await conn.query(
      `SELECT COUNT(*) AS count FROM orders WHERE canteenId = ? AND LOWER(status) = 'delivered' AND UPPER(paymentStatus) = 'DELIVERED'`,
      [canteenId]
    );

    return res.json({
      code: 1,
      meta: { totalCount: meta.count || 0, offset, limit, hasMore: offset + data.length < (meta.count || 0) },
      orders: data,
    });
  } catch (err) {
    console.error('Canteen listDeliveredOrders error:', err);
    return res.status(500).json({ code: -1, message: 'Internal Server Error' });
  } finally {
    if (conn) conn.release();
  }
}

module.exports.listPaidOrders = listPaidOrders;
module.exports.listDeliveredOrders = listDeliveredOrders;

// PATCH /api/Canteen/order/:transactionId/status { paymentStatus }
// Accepts paymentStatus in body or query; also accepts 'status' for backward compatibility.
async function updateOrderStatus(req, res) {
  const payload = req.payload || {};
  const canteenId = payload.CanteenId;
  if (!canteenId) return res.status(401).json({ code: -1, message: 'Not authenticated (canteen)' });

  const transactionId = (req.params.transactionId || '').toString();
  const statusRaw = (
    req.body?.paymentStatus || req.query?.paymentStatus ||
    req.body?.status || req.query?.status ||
    ''
  ).toString().trim();
  if (!transactionId) {
    return res.status(400).json({ code: 0, message: 'Missing transactionId' });
  }
  if (!statusRaw) {
    return res.status(400).json({ code: 0, message: 'Missing paymentStatus' });
  }
  const newPaymentStatus = statusRaw.toUpperCase();
  const ALLOWED = new Set([
  'PENDING','CHARGED','FAILED','CANCELLED','REFUNDED','ACTIVE',
  'PENDING_VBV','AUTHENTICATION_FAILED','AUTHORIZATION_FAILED','EXPIRED','PARTIAL_REFUNDED','PAYMENT_PENDING','PAID','DELIVERED'
  ]);
  if (!ALLOWED.has(newPaymentStatus)) {
    return res.status(400).json({ code: 0, message: 'Invalid paymentStatus', allowed: Array.from(ALLOWED) });
  }

  let conn;
  try {
    conn = await db.getConnection();
    const [rows] = await conn.query(
      'SELECT orderId, userId, status, deliveryTime, transactionId FROM orders WHERE transactionId = ? AND canteenId = ? LIMIT 1',
      [transactionId, canteenId]
    );
    if (!rows.length) {
      return res.status(404).json({ code: 0, message: 'Order not found for this canteen' });
    }
    const order = rows[0];

    // Update paymentStatus only
    await conn.query(
      `UPDATE orders
          SET paymentStatus = ?
        WHERE transactionId = ? AND canteenId = ?`,
      [newPaymentStatus, transactionId, canteenId]
    );
    await conn.commit();

    // Invalidate caches
    try {
      await redis.del(getKeyRedis('canteenOrders', canteenId));
      if (order.userId) await redis.del(getKeyRedis('userOrders', order.userId));
    } catch (_) {}

    return res.json({ code: 1, message: 'Payment status updated',
      orderId: order.orderId, transactionId: order.transactionId, paymentStatus: newPaymentStatus });
  } catch (err) {
    console.error('Canteen updateOrderStatus error:', err);
    if (conn) await conn.rollback();
    return res.status(500).json({ code: -1, message: 'Internal Server Error' });
  } finally {
    if (conn) conn.release();
  }
}

module.exports.updateOrderStatus = updateOrderStatus;
