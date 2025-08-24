const express = require("express");
const router = express.Router();
const { cashfreeVerify } = require('../../Controller/User/orderController');

// No auth required per request; consider adding rate limiting via a proxy or middleware
router.get('/cashfree/verify', cashfreeVerify);

module.exports = router;