const axios = require('axios');
const fs = require('fs');
const path = require('path');

const BOT_TOKEN = process.env.BOT_TOKEN;
const USE_CALLBACKS = process.env.TELEGRAM_USE_CALLBACKS !== 'false'; // default true

function parseEnvChatIds() {
  const raw = process.env.CHAT_ID || '';
  return raw
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

function getCanteenTelegramIds(canteenId) {
  try {
    const file = path.join(__dirname, `../Data/${canteenId}.json`);
    if (!fs.existsSync(file)) return parseEnvChatIds();
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    const ids = Array.isArray(data.telegramIds) ? data.telegramIds : [];
    return ids.length ? ids : parseEnvChatIds();
  } catch (e) {
    return parseEnvChatIds();
  }
}

async function sendMessage(chatId, text, options = {}) {
  if (!BOT_TOKEN) throw new Error('BOT_TOKEN not set');
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
  const payload = {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    ...options
  };
  const res = await axios.post(url, payload);
  return res.data;
}

async function editMessageText(chatId, messageId, text, options = {}) {
  if (!BOT_TOKEN) throw new Error('BOT_TOKEN not set');
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/editMessageText`;
  const payload = {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    ...options
  };
  const res = await axios.post(url, payload);
  return res.data;
}

async function answerCallbackQuery(callbackQueryId, text, showAlert = false) {
  if (!BOT_TOKEN) throw new Error('BOT_TOKEN not set');
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`;
  const payload = { callback_query_id: callbackQueryId };
  if (text) payload.text = text;
  if (showAlert) payload.show_alert = true;
  const res = await axios.post(url, payload);
  return res.data;
}

async function sendToCanteen(canteenId, text, options) {
  const ids = getCanteenTelegramIds(canteenId);
  if (!ids.length) return { sent: 0 };
  let count = 0;
  for (const id of ids) {
    try {
  await sendMessage(id, text, options);
      count++;
    } catch (e) {
      if (process.env.TELEGRAM_DEBUG === 'true') {
        console.warn('Telegram send failed for chat', id, e.response?.data || e.message);
      }
    }
  }
  return { sent: count };
}

// options can be an object applied for all or a function(chatId) => options
async function sendToCanteenDetailed(canteenId, text, options) {
  const ids = getCanteenTelegramIds(canteenId);
  const successes = [];
  const failures = [];
  for (const id of ids) {
    try {
  const opts = typeof options === 'function' ? options(id) : (options || {});
  const data = await sendMessage(id, text, opts);
  successes.push({ chatId: id, ok: true, messageId: data?.result?.message_id || data?.message_id });
      if (process.env.TELEGRAM_DEBUG === 'true') {
        console.log('Telegram sent to', id);
      }
    } catch (e) {
      const err = e.response?.data || e.message;
      failures.push({ chatId: id, error: err });
      if (process.env.TELEGRAM_DEBUG === 'true') {
        console.warn('Telegram failed to', id, err);
      }
    }
  }
  return { ids, successes, failures };
}

module.exports = { sendMessage, editMessageText, answerCallbackQuery, sendToCanteen, sendToCanteenDetailed, getCanteenTelegramIds };

// Build inline keyboard buttons for an order
function buildOrderActions({ apiBase, transactionId, telegramId }) {
  // When callbacks are enabled (default), use callback_data to avoid opening browser
  if (USE_CALLBACKS) {
    const tid = String(transactionId);
    return {
      reply_markup: {
        inline_keyboard: [[
          { text: '✅ DELIVERED', callback_data: `oa|DELIVERED|${tid}` },
          { text: '↩️ REFUND', callback_data: `oa|REFUND|${tid}` }
        ]]
      }
    };
  }
  // Fallback: use URLs (will open browser)
  const tid = encodeURIComponent(transactionId);
  const tg = encodeURIComponent(telegramId || '');
  const base = (apiBase || '').replace(/\/$/, '');
  const deliveredUrl = `${base}/api/telegram/order/action?transactionId=${tid}&action=DELIVERED&telegramId=${tg}`;
  const refundUrl = `${base}/api/telegram/order/action?transactionId=${tid}&action=REFUND&telegramId=${tg}`;
  return {
    reply_markup: {
      inline_keyboard: [[
        { text: '✅ DELIVERED', url: deliveredUrl },
        { text: '↩️ REFUND', url: refundUrl }
      ]]
    }
  };
}

module.exports.buildOrderActions = buildOrderActions;
