const db = require("../../Config/mysqlDb.js");
const { Juspay, APIError } = require('expresscheckout-nodejs');
const crypto = require('crypto');
const cashfree = require('../../Services/PaymentGateway/cashfree');
const config = require('./config.json');
const redis = require('../../Config/redisClint');
const getKeyRedis = require('../../Services/Helper/GetKeysRedis.js');
const { json } = require("body-parser");

const itemRepo=require('../../Services/itemsServices/itemsCRUD.js');
const telegram = require('../../Services/telegram');

// FREECANE eligible categories (case-insensitive)
const FREECANE_ELIGIBLE_CATEGORIES = new Set([
    'Starters', 'FriedRice', 'Pizza', 'Burgers', 'Lunch'
].map(s => String(s).toLowerCase()));

// Coupon utils
function sanitizeCoupons(input) {
    if (!input) return [];
    const arr = Array.isArray(input) ? input : [input];
    const allowed = new Set(['GLUG', 'FREECANE']);
    const out = [];
    for (const c of arr) {
        const s = String(c || '').trim().toUpperCase();
        if (allowed.has(s) && !out.includes(s)) out.push(s);
    }
    return out;
}

function getCouponEffects(coupons) {
    const list = sanitizeCoupons(coupons);
    return {
        hasGLUG: list.includes('GLUG'),
        hasFREECANE: list.includes('FREECANE'),
        list
    };
}

// Order type + time utils
function normalizeOrderType(val) {
    const s = String(val || '').toLowerCase();
    if (s === 'pickup') return 'pickup';
    if (s === 'dinein') return 'dinein';
    if (s === 'takeaway' || s === 'takeway') return 'dinein';
    return 'dinein';
}

function formatTimeAMPM(input) {
    try {
        if (!input) return '';
        const str = String(input).trim();
        let hh = 0, mm = 0;
        // patterns: 'HH:mm', 'YYYY-MM-DD HH:mm:ss'
        const m1 = str.match(/\b(\d{1,2}):(\d{2})(?::\d{2})?\b/);
        if (m1) {
            hh = parseInt(m1[1], 10);
            mm = parseInt(m1[2], 10);
        } else {
            const d = new Date(str);
            if (!isNaN(d.getTime())) {
                hh = d.getHours();
                mm = d.getMinutes();
            } else {
                return str; // fallback
            }
        }
        const ampm = hh >= 12 ? 'PM' : 'AM';
        const h12 = hh % 12 || 12;
        const mmStr = String(mm).padStart(2, '0');
        return `${h12}:${mmStr} ${ampm}`;
    } catch {
        return String(input);
    }
}

async function ensureOrderColumnExists(conn, column, typeDDL) {
    try {
        const [rows] = await conn.query(`SHOW COLUMNS FROM orders LIKE ?`, [column]);
        if (rows && rows.length > 0) return true;
        // Prefer TEXT for compatibility across MySQL versions
        await conn.query(`ALTER TABLE orders ADD COLUMN \`${column}\` ${typeDDL}`);
        return true;
    } catch (e) {
        // Don't block order flow if we cannot alter table; will fallback to not storing coupons
        console.warn(`Unable to ensure column ${column} on orders:`, e.message);
        return false;
    }
}

function formatTelegramMessage({ orderId, name = '', type = '', time = '', itemsText = '', total = '—' }) {
    const lines = [];
    lines.push('🧾 <b>New Order</b>');
    lines.push('');
    if (name) lines.push(`👤 Customer: <b>${name}</b>`);
    lines.push(`🆔 Order: <code>${orderId}</code>`);
    if (type) lines.push(`🧺 Type: ${type}`);
    if (time) lines.push(`🕒 Time: ${time}`);
    lines.push('');
    lines.push('Items:');
    lines.push(itemsText || '—');
    lines.push('');
    lines.push(`💰 Total: <b>₹${total}</b>`);
    return lines.join('\n');
}

async function buildItemsSummary(itemsArray = []) {
    // itemsArray is expected to be [{ itemId, quantity, price }] from orders.items
    const lines = [];
    let total = 0;
    for (const it of itemsArray) {
        const id = it.itemId || it.ItemId;
        const qty = Number(it.quantity || it.qty || 1);
        let name = `Item ${id}`;
        let unitPrice = 0;
        try {
            const itemObj = await itemRepo.getItemById(id);
            if (itemObj) {
                name = itemObj.ItemName || name;
                unitPrice = Number(itemObj.Price || 0);
            }
        } catch (_) {
            // ignore lookup errors
        }
        const lineTotal = unitPrice * qty;
        total += lineTotal;
        lines.push(`- ${qty} x ${name} — ₹${lineTotal}`);
    }
    return { itemsText: lines.join('\n'), total };
}

function computeTotalsFromList(itemsArray = [], { orderType = 'dinein', parcelPrice = 0, coupons = [] } = {}) {
    // Compute using stored price in items list to match charged amount
    const type = normalizeOrderType(orderType);
    let itemsTotal = 0;
    let totalQty = 0;
    for (const it of itemsArray) {
        const qty = Number(it.quantity || it.qty || 1);
        const price = Number(it.price || it.Price || 0);
        itemsTotal += price * qty;
        totalQty += qty;
    }
    const PACKING_CHARGE_PER_ITEM = Number(process.env.PACKING_CHARGE_PER_ITEM || 10);
    const packingCharge = (type === 'pickup') ? (PACKING_CHARGE_PER_ITEM * totalQty) : 0;
    const { hasGLUG, hasFREECANE } = getCouponEffects(coupons);
    const baseSubtotal = itemsTotal + (parcelPrice || packingCharge); // parcelPrice already persisted for pickup policy
    const platformFee = hasGLUG ? 0 : Math.ceil(baseSubtotal * 0.03);
    // Note: freeCaneCount will be computed precisely (by eligible categories) where needed for messages.
    // Keep this as totalQty for backward compatibility in totals, but UI will use eligible count instead.
    const freeCaneCount = hasFREECANE ? totalQty : 0;
    const grandTotal = Math.round((baseSubtotal + platformFee) * 100) / 100;
    return { itemsTotal, totalQty, packingCharge: parcelPrice || packingCharge, platformFee, grandTotal, freeCaneCount, hasGLUG, hasFREECANE };
}

// Compute FREECANE eligible count by hydrating items and checking category membership
async function countEligibleFreeCane(itemsArray = []) {
    try {
        let count = 0;
        for (const it of itemsArray) {
            const id = it.itemId || it.ItemId;
            const qty = Number(it.quantity || it.qty || 1);
            if (!id || qty <= 0) continue;
            try {
                const itemObj = await itemRepo.getItemById(id);
                const cat = String(itemObj?.category || '').toLowerCase();
                if (FREECANE_ELIGIBLE_CATEGORIES.has(cat)) {
                    count += qty;
                }
            } catch (_) {}
        }
        return count;
    } catch { return 0; }
}

const userOrderTime = process.env.redis_time_userorders;
const itemTime = process.env.redis_time_item;

// https://smartgateway.hdfcbank.com/docs/#products

// const tree={
//   id: 'evt_V2_108662b2af7b416295a314d5b802c8a0',
//   date_created: '2025-08-11T18:52:22Z',
//   content: {
//     order: {
//       udf4: '',
//       resp_category: null,
//       emi_details: [Object],
//       txn_detail: [Object],
//       maximum_eligible_refund_amount: 240,
//       udf8: '',
//       udf3: '',
//       udf6: '',
//       offers: [],
//       bank_error_code: '',
//       status: 'CHARGED',
//       order_expiry: '2025-08-11T19:06:54Z',
//       bank_error_message: '',
//       id: 'ordeh_d5959b76a8454781b2af05f6e16230e4',
//       return_url: 'http://localhost:5000/api/User/order/handlePaymentResponse',
//       last_updated: '2025-08-11T18:52:22Z',
//       txn_uuid: 'mozaxxgwBTrzai9pBR3',
//       gateway_id: 23,
//       conflicted: false,
//       metadata: [Object],
//       currency: 'INR',
//       date_created: '2025-08-11T18:51:54Z',
//       resp_message: null,
//       udf2: '',
//       payment_links: [Object],
//       customer_email: null,
//       customer_phone: '9999999999',
//       udf5: '',
//       status_id: 21,
//       merchant_id: 'SG3036',
//       resp_code: null,
//       udf9: '',
//       amount: 240,
//       gateway_reference_id: null,
//       refunded: false,
//       auth_type: 'THREE_DS',
//       order_id: 'TAq2f-iQOe-1-oX37ee',
//       payment_method: 'NB_SBI',
//       udf7: '',
//       additional_info: {},
//       udf10: '',
//       payment_gateway_response: [Object],
//       effective_amount: 240,
//       txn_id: 'SG3036-TAq2f-iQOe-1-oX37ee-1',
//       product_id: '',
//       customer_id: 'user-id:1',
//       payment_method_type: 'NB',
//       amount_refunded: 0,
//       udf1: ''
//     }
//   },
//   event_name: 'ORDER_SUCCEEDED'
// }
// const {sendOrder} = require("../../Services/whatsapp.js");


//const conn = await db.getConnection();
//const [admins] = await conn.query(
//    "SELECT whatsapp_Number FROM CanteenAdmins WHERE canteen_id = ?",
//    [order.canteen_id]
//);

//conn.release();
// const testAdminNumber = "918055221419";
// await sendOrder([testAdminNumber],{
//     name: order.user_name,
//     rollNo: order.user_rollNo,
//     orderId: order.id,
//     items: order.items.map(item => `${item.qty} ${item.name}`).join(","),
//     total: order.total,
//     time: order.preferred_time,
//     type: order.type,
// });



const juspay = new Juspay({
    merchantId: config.MERCHANT_ID,
    baseUrl: config.BASE_URL,
    apiKey: config.API_KEY
});

// Toggle to use Cashfree instead of Juspay/HDFC
const USE_CASHFREE = String(process.env.CASHFREE || '').toLowerCase() === 'true';

function generateCode(n) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let code = '';
    for (let i = 0; i < n; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

function makeError(message) {
    return message || 'Something went wrong'
}

function makeJuspayResponse(successRspFromJuspay) {
    if (successRspFromJuspay == undefined) return successRspFromJuspay
    if (successRspFromJuspay.http != undefined) delete successRspFromJuspay.http
    return successRspFromJuspay
}

function safeParseJSON(val) {
    try {
        if (val == null) return null;
        if (Buffer.isBuffer(val)) return JSON.parse(val.toString('utf8'));
        if (typeof val === 'string') {
            const s = val.trim();
            if (s.startsWith('{') || s.startsWith('[')) return JSON.parse(s);
            if (s === '[object Object]') return null;
            return null;
        }
        if (typeof val === 'object') return val;
        return null;
    } catch {
        return null;
    }
}

async function placeOrder(req, res) {
    const userId = req.payload.userId;
    const orderType = normalizeOrderType(req.body.orderType || 'dinein');
    const deliveryTime = req.body.deliveryTime;
    const coupons = sanitizeCoupons(req.body.coupons);
    if (!deliveryTime) {
        return res.status(400).json({ code: 0, message: "Delivery time is required." });
    }
    //console.log(userId);

    let conn;
    // This will store the per-item service/parcel charge in the DB
    let parcelPrice = 0;


    try {
        const cacheKey = getKeyRedis('UserCart', userId);
        let cacheCart = await redis.get(cacheKey);

        if (!cacheCart) {
            return res.status(404).json({ code: 0, message: "Cart data not found." });
        }

        cacheCart = JSON.parse(cacheCart);

        if (cacheCart.canteenId === -9 || cacheCart.cart.length === 0) {
            return res.json({ code: 0, message: "Cart is empty." });
        }

        const [deliveryHour, deliveryMinute] = deliveryTime.split(":").map(Number);
        const deliveryTotalMins = deliveryHour * 60 + deliveryMinute;

        const itemKeys = cacheCart.cart.map(cartItem => getKeyRedis('CanteenItem', cartItem.itemId));
        if (!itemKeys.length) {
            return res.status(404).json({ code: 0, message: "Cart is empty." });
        }
        let itemsData = await redis.mget(itemKeys);

        const missingItems = [];
        const missingIndices = [];

        // Parse items and collect missing ones
        itemsData = itemsData.map((itemData, index) => {
            if (!itemData) {
                missingItems.push(cacheCart.cart[index].itemId);
                missingIndices.push(index);
                return null;
            }
            try {
                return JSON.parse(itemData);
            } catch {
                missingItems.push(cacheCart.cart[index].itemId);
                missingIndices.push(index);
                return null;
            }
        });

        // Fetch missing items from DB
        if (missingItems.length > 0) {
            const dbResults = await Promise.all(missingItems.map(id => itemRepo.getItemById(id)));

            dbResults.forEach((item, i) => {
                itemsData[missingIndices[i]] = item;
                redis.setex(getKeyRedis('CanteenItem', missingItems[i]), itemTime, JSON.stringify(item));
            });
        }

        const cart = [];
        let isAvalable = true;

        for (let i = 0; i < itemsData.length; i++) {
            const item = itemsData[i];
            const cartItem = cacheCart.cart[i];

            if (!item) continue;

            const { ava, startTime, endTime } = item;
            item.code = 1;

            if (!ava) {
                item.code = -1;
                item.message = `Item ID ${cartItem.itemId} is currently unavailable.`;
                isAvalable = false;
            }

            if (startTime && endTime) {
                const [startHour, startMinute] = startTime.split(":").map(Number);
                const [endHour, endMinute] = endTime.split(":").map(Number);

                const startTotalMins = startHour * 60 + startMinute;
                const endTotalMins = endHour * 60 + endMinute;

                if (deliveryTotalMins < startTotalMins || deliveryTotalMins > endTotalMins) {
                    item.code = 0;
                    item.message = `Item ID ${cartItem.itemId} is only available from ${startTime} to ${endTime}.`;
                    isAvalable = false;
                }
            }

            item.quantity = cartItem.quantity || 1;

            cart.push(item);
        }

        if (!isAvalable) {
            return res.json({ code: 0, message: 'Some items are unavailable or not within the allowed time.', cart: cart });
        }

        //console.log("Cart Items:", JSON.stringify(cart, null, 2));

    // Base items total (sum of item price * quantity for available items)
    const itemsTotal = cart.reduce((acc, item) => {
            //console.log(item,acc);
            if (item.code === 1) {
                return acc + (item.Price * Number(item.quantity));
            }
            return acc;
        }, 0);
        
    // Total quantity across all items
    const totalQuantity = cart.reduce((acc, item) => acc + Number(item.quantity || 1), 0);

    // New fee policy:
    // - Packing charge applies ONLY for pickup, per item
    // - Platform fee = ceil(3% of base subtotal) unless GLUG coupon is applied
    const PACKING_CHARGE_PER_ITEM = Number(process.env.PACKING_CHARGE_PER_ITEM || 10);
    const type = normalizeOrderType(orderType);

    const packingCharge = (type === 'pickup') ? (PACKING_CHARGE_PER_ITEM * totalQuantity) : 0;
    // base before platform fee
    const baseSubtotal = itemsTotal + packingCharge;
    const { hasGLUG } = getCouponEffects(coupons);
    const platformFee = hasGLUG ? 0 : Math.ceil(baseSubtotal * 0.03);

    // Final amount to charge (rounded to 2 decimals for gateway)
    let totalAmount = baseSubtotal + platformFee;
    totalAmount = Math.round(totalAmount * 100) / 100;

    // Persist only packing charge in parcelPrice
    parcelPrice = packingCharge;

        conn = await db.getConnection();
        await conn.beginTransaction();

        const transactionId = `T${generateCode(4)}-${generateCode(4)}-${userId}-${generateCode(6)}`;
        
        // Use env/config-based returnUrl instead of hardcoded localhost
        const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || config.PUBLIC_BASE_URL;
        if (!PUBLIC_BASE_URL) {
            throw new Error("Set PUBLIC_BASE_URL to your public backend URL");
        }
        const returnUrl = `${PUBLIC_BASE_URL.replace(/\/$/, "")}/api/User/order/handlePaymentResponse`;

        const itemsForDB = cart.map(item => ({
            itemId: item.ItemId,
            quantity: Number(item.quantity),
            price: item.Price
        }));

        // Ensure coupons column exists; store as JSON string if available
        const couponsOk = await ensureOrderColumnExists(conn, 'coupons', 'TEXT NULL');

        if (couponsOk) {
            await conn.query(
                `INSERT INTO orders 
                (transactionId, status, canteenId, deliveryTime, userId, items, orderType, parcelPrice, coupons) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    transactionId,
                    'pending',
                    cacheCart.canteenId,
                    `${new Date().toISOString().split("T")[0]} ${deliveryTime}:00`, // Combine current date + deliveryTime
                    userId,
                    JSON.stringify(itemsForDB),
                    orderType,
                    parcelPrice,
                    JSON.stringify(coupons)
                ]
            );
        } else {
            await conn.query(
                `INSERT INTO orders 
                (transactionId, status, canteenId, deliveryTime, userId, items, orderType, parcelPrice) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    transactionId,
                    'pending',
                    cacheCart.canteenId,
                    `${new Date().toISOString().split("T")[0]} ${deliveryTime}:00`, // Combine current date + deliveryTime
                    userId,
                    JSON.stringify(itemsForDB),
                    orderType,
                    parcelPrice
                ]
            );
        }



        let sessionResponse;
    if (USE_CASHFREE) {
            // Cashfree payment link flow
            // Return URL must be HTTPS and should point to frontend callback
            // e.g., https://kleats.in/payment/callback?order_id={order_id}
            // Prefer explicit CASHFREE_RETURN_BASE_URL, else fall back to FRONTEND_URL/config.FRONTEND_URL
            const returnBaseRaw = process.env.CASHFREE_RETURN_BASE_URL || process.env.FRONTEND_URL || config.FRONTEND_URL || '';
            const RETURN_BASE = (returnBaseRaw || '').replace(/\/$/, "");
            if (!RETURN_BASE) {
                await conn.rollback();
                return res.status(500).json({ code: 0, message: 'Cashfree return URL base not configured' });
            }
            const cfReturnUrl = `${RETURN_BASE}/payment/callback?order_id={order_id}`;
            // Notify URL (webhook) - keep as provided in env (can be http if needed)
            const NOTIFY_BASE = (process.env.CASHFREE_NOTIFY_BASE_URL || PUBLIC_BASE_URL).replace(/\/$/, "");
            const notifyUrl = `${NOTIFY_BASE}/cashfree/webhook`;

            // Fetch customer details for Cashfree (phone/email often required in production)
            let customerPhone = undefined, customerEmail = undefined, customerName = undefined;
            try {
                const [userRows] = await conn.execute(
                    'SELECT name, email, phoneNo FROM users WHERE userId = ? LIMIT 1',
                    [userId]
                );
                if (userRows && userRows.length) {
                    const u = userRows[0];
                    customerPhone = u.phoneNo || undefined;
                    customerEmail = u.email || undefined;
                    customerName = u.name || undefined;
                }
            } catch (e) {
                console.warn('Unable to fetch user contact details for Cashfree, proceeding without:', e.message);
            }

            // Cashfree production typically requires a phone number; enforce before creating order
            if (!customerPhone) {
                await conn.rollback();
                return res.status(400).json({
                    code: 0,
                    message: 'Phone number is required for payment. Please update your profile before placing the order.'
                });
            }

            console.log('[Cashfree] Using URLs:', { returnUrl: cfReturnUrl, notifyUrl });
            const cf = await cashfree.createOrder({
                orderId: transactionId,
                amount: totalAmount,
                currency: 'INR',
                userId,
                returnUrl: cfReturnUrl,
                notifyUrl,
                canteenId: cacheCart.canteenId,
                customerPhone,
                customerEmail,
                customerName
            });
            sessionResponse = { provider: 'cashfree', payment_link: cf.paymentLink, raw: cf.raw };
        } else {
            // Juspay/HDFC flow
            sessionResponse = await juspay.orderSession.create({
                order_id: transactionId,
                amount: totalAmount,
                payment_page_client_id: config.PAYMENT_PAGE_CLIENT_ID,                    // [required] shared with you, in config.json
                customer_id: 'user-id:' + userId,                       // [optional] your customer id here
                action: 'paymentPage',                                          // [optional] default is paymentPage
                return_url: returnUrl,                                          // [optional] default is value given from dashboard
                currency: 'INR',
                udf1: '' + cacheCart.canteenId,
                udf2: '' + userId
            });
        }

        await conn.commit();

    return res.json(makeJuspayResponse(sessionResponse));


    } catch (err) {
        console.log(err);
        if (conn) await conn.rollback();
        return res.json({ code: -1, message: 'Internal Server error.' });
    } finally {
        if (conn) conn.release();
    }
}

async function cashfreeWebhook(req, res) {
    let conn;
    try {
        // Obtain raw body in a robust way: Buffer (preferred), string, or reconstruct from object
        let rawBuf = null;
        let reconstructed = false;
        if (Buffer.isBuffer(req.body)) {
            rawBuf = req.body;
        } else if (typeof req.body === 'string') {
            rawBuf = Buffer.from(req.body, 'utf8');
        } else if (req.rawBody && Buffer.isBuffer(req.rawBody)) {
            rawBuf = req.rawBody;
        } else {
            // Fallback (signature may not match when reconstructing)
            rawBuf = Buffer.from(JSON.stringify(req.body || {}), 'utf8');
            reconstructed = true;
        }

    const signature = req.headers['x-webhook-signature'] || req.headers['x-cf-signature'];
    const timestamp = req.headers['x-webhook-timestamp'] || req.headers['x-cf-timestamp'] || '';
    // Fallback to CASHFREE_SECRET (client secret) if no dedicated webhook secret is configured
    const secret = process.env.CASHFREE_WEBHOOK_SECRET || process.env.CASHFREE_SECRET;

        if (!secret) {
            console.warn('No Cashfree secret found (CASHFREE_WEBHOOK_SECRET/CASHFREE_SECRET); skipping signature verification');
        } else if (!signature) {
            console.error('Cashfree webhook missing signature');
            return res.status(400).send('Missing signature');
        } else {
            // Per docs: HMAC-SHA256 of (timestamp + rawPayload), base64-encoded
            const signedPayload = Buffer.concat([Buffer.from(String(timestamp)), rawBuf]).toString('utf8');
            const expected = crypto.createHmac('sha256', secret).update(signedPayload).digest('base64');
            const valid = crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(String(signature)));
            if (!valid) {
                const reason = reconstructed ? ' (raw body reconstructed; proxy may have parsed JSON)' : '';
                console.error('Cashfree webhook signature mismatch' + reason);
                return res.status(400).send('Invalid signature');
            }
        }

        // Parse JSON safely
        let payload;
        try {
            payload = JSON.parse(rawBuf.toString('utf8'));
        } catch (_) {
            payload = (req.body && typeof req.body === 'object') ? req.body : null;
        }
        console.log('Cashfree Webhook Payload:', payload);
        const orderId = payload?.data?.order?.order_id
            || payload?.data?.payment?.order_id
            || payload?.order_id
            || payload?.order?.order_id
            || payload?.orderId;
        if (!orderId) {
            console.error('Cashfree webhook: order_id missing in payload');
            return res.status(400).send('order_id missing');
        }

        // Query Cashfree for authoritative status
        const statusResponse = await cashfree.getOrderStatus(orderId);
        const cfStatus = (statusResponse.order_status || '').toUpperCase();
        const orderStatus = cfStatus === 'PAID' ? 'CHARGED' : (cfStatus === 'ACTIVE' ? 'PENDING' : cfStatus);

        conn = await db.getConnection();
        await conn.query(
            `UPDATE orders 
             SET paymentStatus = ? , status='order_confirmed'
             WHERE transactionId = ?`,
            [orderStatus, orderId]
        );
        await conn.commit();

        if (orderStatus === 'CHARGED') {
            const [orderDetails] = await conn.execute(
                "SELECT orderId, userId, canteenId, items, orderType, deliveryTime, parcelPrice, coupons FROM orders WHERE transactionId = ?",
                [orderId]
            );
            if (orderDetails.length > 0) {
                const { orderId: oid, userId, canteenId, items, orderType, deliveryTime, parcelPrice, coupons } = orderDetails[0];
                await redis.del(getKeyRedis('UserCart', userId));
                await redis.del(getKeyRedis('canteenOrders', canteenId));
                await redis.del(getKeyRedis('userOrders', userId));

                // Telegram notify (idempotent)
                try {
                    const k = getKeyRedis('tg_notified', `${orderId}`);
                    const already = await redis.get(k);
                    console.log('[TG] cashfreeWebhook order', orderId, 'idempotent?', Boolean(already));
                    if (!already) {
                        const [urows] = await conn.query('SELECT name, email, phoneNo FROM users WHERE userId = ? LIMIT 1', [userId]);
                        let name = (urows?.[0]?.name || urows?.[0]?.phoneNo || urows?.[0]?.email || '').toString();
                        if (!name) name = `User ${userId}`;
                        const list = safeParseJSON(items) || [];
                        const { itemsText } = await buildItemsSummary(list);
                        const couponsArr = safeParseJSON(coupons) || [];
                        const totals = computeTotalsFromList(list, { orderType, parcelPrice, coupons: couponsArr });
                        const { hasFREECANE } = getCouponEffects(couponsArr);
                        const eligibleFree = hasFREECANE ? await countEligibleFreeCane(list) : 0;
                        const freebiesLine = eligibleFree > 0 ? `\n+ ${eligibleFree} x Sugarcane Juice — FREE` : '';
                        const couponsLine = (Array.isArray(couponsArr) && couponsArr.length) ? `\nCoupons: ${couponsArr.join(', ')}` : '';
                        const msgItems = `${itemsText}${freebiesLine}${couponsLine}`;
                        const simpleTime = formatTimeAMPM(deliveryTime);
                        const msg = formatTelegramMessage({ orderId, name, type: normalizeOrderType(orderType), time: simpleTime, itemsText: msgItems, total: totals.grandTotal });
                        const apiBase = (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
                        const optionsFn = (chatId) => telegram.buildOrderActions({ apiBase, transactionId: orderId, telegramId: chatId });
                        const result = await telegram.sendToCanteenDetailed(canteenId, msg, optionsFn);
                        console.log('[TG] cashfreeWebhook result:', JSON.stringify(result));
                        // Save message map for later edits
                        try {
                            const mapKey = getKeyRedis('tg_msgmap', orderId);
                            const entries = (result?.successes || []).map(s => ({ chatId: s.chatId, messageId: s.messageId }));
                            if (entries.length) await redis.setex(mapKey, 60 * 60 * 12, JSON.stringify(entries));
                        } catch (e) { if (process.env.TELEGRAM_DEBUG==='true') console.warn('TG map save failed', e.message); }
                        const successes = Array.isArray(result?.successes) ? result.successes.length : 0;
                        if (successes > 0) {
                            await redis.setex(k, 60 * 60 * 6, '1');
                        } else {
                            console.warn('[TG] cashfreeWebhook: no successful sends; not setting idempotency key');
                        }
                    }
                } catch (e) {
                    console.warn('Telegram notify failed:', e.response?.data || e.message);
                }
            }
        }

        return res.status(200).send('Webhook received');
    } catch (error) {
        console.error('Cashfree webhook processing failed:', error);
        if (conn) await conn.rollback();
        return res.status(400).send('Invalid webhook');
    } finally {
        if (conn) conn.release();
    }
}
// Handle the payment return from Juspay/HDFC. Robust to GET/POST and missing fields.
async function handlePaymentResponse(req, res) {
    let conn;
    const frontendUrl = process.env.FRONTEND_URL || config.FRONTEND_URL || "http://188.245.112.188:5000";
    try {
        // Extract order and status from query/body
        const q = req.query || {};
        const b = req.body || {};
        const orderId = q.order_id || b.order_id || q.orderId || b.orderId || q.order || b.order;
        let orderStatus = (q.status || b.status || '').toString().toUpperCase();

        if (!orderId) {
            return res.redirect(`${frontendUrl}/payment-error?error=${encodeURIComponent('Missing order_id')}`);
        }

        // Map a few known statuses if necessary
        // If empty, treat as FAILED to be safe
        if (!orderStatus) orderStatus = 'FAILED';

        // Persist status
        conn = await db.getConnection();
        const [updateResult] = await conn.query(
            `UPDATE orders 
             SET paymentStatus = ? , status='order_confirmed'
             WHERE transactionId = ?`,
            [orderStatus, orderId]
        );
        await conn.commit();

        // Clear caches on success
        if (orderStatus === 'CHARGED') {
            const [orderDetails] = await conn.execute(
                "SELECT userId, canteenId FROM orders WHERE transactionId = ?",
                [orderId]
            );
            if (orderDetails.length > 0) {
                const { userId, canteenId } = orderDetails[0];
                await redis.del(getKeyRedis('UserCart', userId));
                await redis.del(getKeyRedis('canteenOrders', canteenId));
                await redis.del(getKeyRedis('userOrders', userId));
            }
            return res.redirect(`${frontendUrl}/payment-success?orderId=${orderId}&status=${orderStatus}`);
        }

        // Non-success statuses
        let message = '';
        switch (orderStatus) {
            case 'PENDING':
                message = 'order pending';
                break;
            case 'AUTHENTICATION_FAILED':
            case 'AUTHORIZATION_FAILED':
                message = 'order payment authentication failed';
                break;
            default:
                message = 'order status ' + orderStatus;
                break;
        }
        return res.redirect(`${frontendUrl}/payment-status?orderId=${orderId}&status=${orderStatus}&message=${encodeURIComponent(message)}`);
    } catch (err) {
        console.error('Error in handlePaymentResponse:', err);
        if (conn) await conn.rollback();
        return res.redirect(`${frontendUrl}/payment-error?error=${encodeURIComponent(err.message || 'unknown')}`);
    } finally {
        if (conn) conn.release();
    }
}

async function juspayWebhook(req, res) {

    let conn;
    try {
        const jwePayload = req.body;
        console.log("Juspay Webhook Payload:", jwePayload);
        const orderId = jwePayload.content.order.order_id;
        const orderStatus = jwePayload.content.order.status;
        const canteenId = jwePayload.content.order.udf1;
        const userId = jwePayload.content.order.udf2;
        conn = await db.getConnection();

        await conn.query(
            `UPDATE orders 
             SET paymentStatus = ? , status='order_confirmed'
             WHERE transactionId = ?`,
            [orderStatus, orderId]
        );

        await conn.commit();

    if (orderStatus === "CHARGED") {
            /*const [result] = await conn.query(
                `SELECT * FROM orders WHERE transactionId = ?`,
                [orderId]
            );

            const order = result[0];
            console.log(order);

            const items=JSON.parse(order.items);*/

            await redis.del(getKeyRedis('UserCart', userId));
            await redis.del(getKeyRedis('canteenOrders', canteenId));
            await redis.del(getKeyRedis('userOrders', userId));

        try {
                const [orderDetails] = await conn.execute(
            "SELECT orderId, items, orderType, deliveryTime, parcelPrice, coupons FROM orders WHERE transactionId = ?",
                    [orderId]
                );
                if (orderDetails.length) {
            const { orderId: oid, items, orderType, deliveryTime, parcelPrice, coupons } = orderDetails[0];
            const list = safeParseJSON(items) || [];
                    const { itemsText } = await buildItemsSummary(list);
            const couponsArr = safeParseJSON(coupons) || [];
            const totals = computeTotalsFromList(list, { orderType, parcelPrice, coupons: couponsArr });
                    const simpleTime = formatTimeAMPM(deliveryTime);
                    // Fetch customer name for better message context
                    let name = '';
                    try {
                        const [urows] = await conn.query('SELECT name, email, phoneNo FROM users WHERE userId = ? LIMIT 1', [userId]);
                        name = (urows?.[0]?.name || urows?.[0]?.phoneNo || urows?.[0]?.email || '').toString();
                    } catch {}
                    const { hasFREECANE } = getCouponEffects(couponsArr);
                    const eligibleFree = hasFREECANE ? await countEligibleFreeCane(list) : 0;
                    const freebiesLine = eligibleFree > 0 ? `\n+ ${eligibleFree} x Sugarcane Juice — FREE` : '';
                    const couponsLine = (Array.isArray(couponsArr) && couponsArr.length) ? `\nCoupons: ${couponsArr.join(', ')}` : '';
                    const msgItems = `${itemsText}${freebiesLine}${couponsLine}`;
                    const msg = formatTelegramMessage({ orderId, name, type: normalizeOrderType(orderType), time: simpleTime, itemsText: msgItems, total: totals.grandTotal });
                    const apiBase = (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
                    const optionsFn = (chatId) => telegram.buildOrderActions({ apiBase, transactionId: orderId, telegramId: chatId });
                    const result = await telegram.sendToCanteenDetailed(canteenId, msg, optionsFn);
                    console.log('[TG] juspayWebhook result:', JSON.stringify(result));
                    try {
                        const mapKey = getKeyRedis('tg_msgmap', orderId);
                        const entries = (result?.successes || []).map(s => ({ chatId: s.chatId, messageId: s.messageId }));
                        if (entries.length) await redis.setex(mapKey, 60 * 60 * 12, JSON.stringify(entries));
                    } catch (e) { if (process.env.TELEGRAM_DEBUG==='true') console.warn('TG map save failed', e.message); }
                    const successes = Array.isArray(result?.successes) ? result.successes.length : 0;
                    if (successes === 0) {
                        console.warn('[TG] juspayWebhook: no successful sends');
                    }
                }
            } catch (e) {
                console.warn('Telegram notify (Juspay) failed:', e.message);
            }


        }

        res.status(200).send("Webhook received");
    } catch (error) {
        console.error("Webhook processing failed:", error);
        res.status(400).send("Invalid webhook");
    }
}

// GET /api/User/payment/cashfree/verify?order_id=CF_ORDER_ID
// No auth required; validates order_id format, queries Cashfree, updates DB, returns sanitized JSON
// Simple per-IP rate limiter: max 20 requests/minute
const _verifyHits = new Map();
function _rateLimitOk(ip) {
    const now = Date.now();
    const windowMs = 60 * 1000;
    const max = 20;
    const entry = _verifyHits.get(ip) || { t: now, c: 0 };
    if (now - entry.t > windowMs) {
        entry.t = now; entry.c = 0;
    }
    entry.c += 1;
    _verifyHits.set(ip, entry);
    return entry.c <= max;
}

async function cashfreeVerify(req, res) {
    const orderId = req.query.order_id || req.query.orderId;
    const force = ['1','true','yes'].includes(String(req.query.force || '').toLowerCase());
    if (!orderId || typeof orderId !== 'string' || orderId.length > 128) {
        return res.status(400).json({ code: 0, message: 'Invalid order_id' });
    }
    if (!_rateLimitOk(req.ip || req.headers['x-forwarded-for'] || 'unknown')) {
        return res.status(429).json({ code: 0, message: 'Too many requests' });
    }

    let conn;
    try {
        // Query Cashfree for status
        const statusResponse = await cashfree.getOrderStatus(orderId);
        const cfStatus = (statusResponse.order_status || '').toUpperCase();
        const orderStatus = cfStatus === 'PAID' ? 'CHARGED' : (cfStatus === 'ACTIVE' ? 'PENDING' : cfStatus);

        conn = await db.getConnection();
        const [updateResult] = await conn.query(
            `UPDATE orders 
             SET paymentStatus = ? , status='order_confirmed'
             WHERE transactionId = ?`,
            [orderStatus, orderId]
        );
        await conn.commit();

    // Clear caches when paid
    if (orderStatus === 'CHARGED') {
            const [orderDetails] = await conn.execute(
        "SELECT orderId, userId, canteenId, items, orderType, deliveryTime, parcelPrice, coupons FROM orders WHERE transactionId = ?",
                [orderId]
            );
            if (orderDetails.length > 0) {
        const { orderId: oid, userId, canteenId, items, orderType, deliveryTime, parcelPrice, coupons } = orderDetails[0];
                await redis.del(getKeyRedis('UserCart', userId));
                await redis.del(getKeyRedis('canteenOrders', canteenId));
                await redis.del(getKeyRedis('userOrders', userId));

                // Telegram notify (idempotent, with optional force)
                try {
                    const k = getKeyRedis('tg_notified', `${orderId}`);
                    const already = await redis.get(k);
                    console.log('[TG] cashfreeVerify order', orderId, 'idempotent?', Boolean(already), 'force?', force);
                    if (!already || force) {
                        const [urows] = await conn.query('SELECT name, email, phoneNo FROM users WHERE userId = ? LIMIT 1', [userId]);
                        let name = (urows?.[0]?.name || urows?.[0]?.phoneNo || urows?.[0]?.email || '').toString();
                        if (!name) name = `User ${userId}`;
                        const list = safeParseJSON(items) || [];
                        const { itemsText } = await buildItemsSummary(list);
                        const couponsArr = safeParseJSON(coupons) || [];
                        const totals = computeTotalsFromList(list, { orderType, parcelPrice, coupons: couponsArr });
                        const { hasFREECANE } = getCouponEffects(couponsArr);
                        const eligibleFree = hasFREECANE ? await countEligibleFreeCane(list) : 0;
                        const freebiesLine = eligibleFree > 0 ? `\n+ ${eligibleFree} x Sugarcane Juice — FREE` : '';
                        const couponsLine = (Array.isArray(couponsArr) && couponsArr.length) ? `\nCoupons: ${couponsArr.join(', ')}` : '';
                        const msgItems = `${itemsText}${freebiesLine}${couponsLine}`;
                        const simpleTime = formatTimeAMPM(deliveryTime);
                        const msg = formatTelegramMessage({ orderId, name, type: normalizeOrderType(orderType), time: simpleTime, itemsText: msgItems, total: totals.grandTotal });
                        const apiBase = (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
                        const optionsFn = (chatId) => telegram.buildOrderActions({ apiBase, transactionId: orderId, telegramId: chatId });
                        const result = await telegram.sendToCanteenDetailed(canteenId, msg, optionsFn);
                        console.log('[TG] cashfreeVerify result:', JSON.stringify(result));
                        try {
                            const mapKey = getKeyRedis('tg_msgmap', orderId);
                            const entries = (result?.successes || []).map(s => ({ chatId: s.chatId, messageId: s.messageId }));
                            if (entries.length) await redis.setex(mapKey, 60 * 60 * 12, JSON.stringify(entries));
                        } catch (e) { if (process.env.TELEGRAM_DEBUG==='true') console.warn('TG map save failed', e.message); }
                        const successes = Array.isArray(result?.successes) ? result.successes.length : 0;
                        if (successes > 0) {
                            await redis.setex(k, 60 * 60 * 6, '1');
                        } else {
                            console.warn('[TG] cashfreeVerify: no successful sends; not setting idempotency key');
                        }
                    }
                } catch (e) {
                    console.warn('Telegram notify failed:', e.response?.data || e.message);
                }
            }
        }

        return res.status(200).json({
            status: orderStatus,
            cf_order_id: orderId,
            orderId: orderId
        });
    } catch (err) {
        console.error('cashfreeVerify error:', err);
        if (conn) await conn.rollback();
        return res.status(500).json({ code: -1, message: 'Internal Server Error' });
    } finally {
        if (conn) conn.release();
    }
}

// const orders = {
//     meta: {
//         totalCount: 0,
//         offset: 0,
//         limit: 7,
//         hasMore: false
//     },
//     orders: []
// }

async function getOrders(req, res) {
    const userId = req.payload.userId;
    const requestOffset = Number(req.query.offset) || 0;
    const limit = 7;

    let conn;
    try {
        conn = await db.getConnection();
        const cacheKey = getKeyRedis('userOrders', userId);
        let ordersData = await redis.get(cacheKey);
        let orders;
        let pagedItems;
        let fetchFromDb = true;

        if (ordersData) {
            orders = JSON.parse(ordersData);
            const itemsAvailable = orders.orders.slice(requestOffset, requestOffset + limit);

            if (itemsAvailable.length === limit ||
                (requestOffset < orders.orders.length && !orders.meta.hasMore)) {
                pagedItems = itemsAvailable;
                fetchFromDb = false;
            }
        } else {
            orders = { meta: { totalCount: 0, offset: 0, limit, hasMore: false }, orders: [] };
        }

        if (fetchFromDb) {
            if (orders.meta.totalCount === 0) {
                const [rows] = await conn.query(`
                    SELECT orderId, transactionId, status, canteenId, orderTime, deliveryTime,
                           userId, items, orderType, parcelPrice, paymentStatus,
                           COUNT(*) OVER() AS totalCount
                    FROM orders
                    WHERE userId = ? AND paymentStatus in ('REFUNDED','CHARGED','DELIVERED')
                    ORDER BY orderTime DESC
                    LIMIT ?, ?`,
                    [userId, orders.orders.length, limit]
                );

                orders.meta.totalCount = rows.length ? rows[0].totalCount : 0;
                const newItems = rows.map(r => {
                    let parsedItems = [];
                    try {
                        const v = r.items;
                        if (v == null) {
                            parsedItems = [];
                        } else if (Buffer.isBuffer(v)) {
                            const s = v.toString('utf8');
                            parsedItems = JSON.parse(s);
                        } else if (typeof v === 'string') {
                            const s = v.trim();
                            if (s.startsWith('{') || s.startsWith('[')) {
                                parsedItems = JSON.parse(s);
                            } else if (s === '[object Object]') {
                                // Malformed serialization; fallback to empty
                                parsedItems = [];
                            } else {
                                // Try a defensive parse after quoting if needed; else empty
                                parsedItems = [];
                            }
                        } else if (Array.isArray(v)) {
                            parsedItems = v;
                        } else if (typeof v === 'object') {
                            parsedItems = v;
                        } else {
                            parsedItems = [];
                        }
                    } catch (e) {
                        console.warn('Failed to parse order items for order', r.orderId || r.transactionId, e.message);
                        parsedItems = [];
                    }
                    return { ...r, items: parsedItems };
                });
                orders.orders.push(...newItems);
            }

            orders.meta.offset = 0;
            orders.meta.limit = limit;
            orders.meta.hasMore = orders.orders.length < orders.meta.totalCount;

            await redis.set(cacheKey, JSON.stringify(orders), 'EX', userOrderTime);
            pagedItems = orders.orders.slice(requestOffset, requestOffset + limit);
            if (!Array.isArray(pagedItems)) pagedItems = [];
        }

        
        const allItemIds = [...new Set(pagedItems.flatMap(o => o.items.map(i => i.itemId)))];
        const redisKeys = allItemIds.map(id => getKeyRedis('CanteenItem', id));

        // Bulk get from Redis - guard against empty arrays
        const cachedItems = redisKeys.length ? await redis.mget(redisKeys) : [];
        const itemMap = {};

        // Identfy missing item IDs
        const missingIds = [];
        cachedItems.forEach((data, idx) => {
            const parsed = safeParseJSON(data);
            if (parsed) {
                itemMap[allItemIds[idx]] = parsed;
            } else {
                missingIds.push(allItemIds[idx]);
            }
        });

        if (missingIds.length) {
            const dbItems = await itemRepo.getItemsByIds(missingIds);
            dbItems.forEach(item => {
                itemMap[item.ItemId] = item;
                redis.setex(getKeyRedis('CanteenItem', item.ItemId), itemTime, JSON.stringify(item));
            });
        }

        pagedItems.forEach(order => {
            order.items = order.items.map(i => ({
                ...itemMap[i.itemId],
                Price: i.price,
                Quantity: i.quantity
            }));
        });

        return res.json({ code: 1, data: { meta: orders.meta, items: pagedItems } });

    } catch (err) {
        console.error(err);
        return res.json({ code: -1, message: 'Internal Server error.' });
    } finally {
        if (conn) conn.release();
    }
}

module.exports = {
    placeOrder,
    handlePaymentResponse,
    juspayWebhook,
    cashfreeWebhook,
    cashfreeVerify,
    getOrders
};
