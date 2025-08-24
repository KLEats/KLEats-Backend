const express = require('express');
const router = express.Router();
const { telegramWebhook } = require('../../Controller/Telegram/webhookController');

// Use JSON body (Telegram sends JSON for webhook updates)
router.post('/webhook', express.json(), telegramWebhook);

module.exports = router;
