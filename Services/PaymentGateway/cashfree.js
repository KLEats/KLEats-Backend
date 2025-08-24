const axios = require('axios');

// Simple Cashfree service abstraction
// Env vars expected:
//  - CASHFREE_ENV: sandbox|production (default sandbox)
//  - CASHFREE_APP_ID
//  - CASHFREE_SECRET
//  - CASHFREE_API_VERSION (default: 2023-08-01)

const ENV = (process.env.CASHFREE_ENV || 'sandbox').toLowerCase();
const BASE_URL = ENV === 'production' ? 'https://api.cashfree.com' : 'https://sandbox.cashfree.com';
const APP_ID = process.env.CASHFREE_APP_ID;
const SECRET = process.env.CASHFREE_SECRET;
const API_VERSION = process.env.CASHFREE_API_VERSION || '2022-09-01';

function authHeaders() {
  if (!APP_ID || !SECRET) {
    throw new Error('Cashfree credentials missing: set CASHFREE_APP_ID and CASHFREE_SECRET');
  }
  return {
    'x-client-id': APP_ID,
    'x-client-secret': SECRET,
    'x-api-version': API_VERSION,
    'Content-Type': 'application/json'
  };
}

async function createOrder({ orderId, amount, currency = 'INR', userId, returnUrl, notifyUrl, canteenId, customerPhone, customerEmail, customerName }) {
  const url = `${BASE_URL}/pg/orders`;
  const payload = {
    order_id: orderId,
    order_amount: Number(amount),
    order_currency: currency,
    customer_details: {
  customer_id: String(userId || 'guest'),
  // Cashfree production requires phone/email; include when provided
  ...(customerPhone ? { customer_phone: String(customerPhone) } : {}),
  ...(customerEmail ? { customer_email: String(customerEmail) } : {}),
  ...(customerName ? { customer_name: String(customerName) } : {}),
    },
    order_meta: {
      return_url: returnUrl,
      notify_url: notifyUrl,
      udf1: String(canteenId || ''),
      udf2: String(userId || '')
    }
  };

  const { data } = await axios.post(url, payload, { headers: authHeaders() });
  // data has payment_link
  return { paymentLink: data?.payment_link, raw: data };
}

async function getOrderStatus(orderId) {
  const url = `${BASE_URL}/pg/orders/${encodeURIComponent(orderId)}`;
  const { data } = await axios.get(url, { headers: authHeaders() });
  return data; // includes order_status and payments if any
}

module.exports = {
  createOrder,
  getOrderStatus,
};
