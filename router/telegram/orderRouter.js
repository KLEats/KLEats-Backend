const express = require('express');
const router = express.Router();
const { orderAction } = require('../../Controller/Telegram/orderController');

// No JWT; authorization done via telegramId membership in canteen config
router.get('/order/action', orderAction);
router.post('/order/action', express.json(), orderAction);

module.exports = router;
