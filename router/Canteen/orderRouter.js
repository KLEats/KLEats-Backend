const express = require('express');
const router = express.Router();
const verifyToken = require('../../MiddleWare/verifyUserToken');
const { listOrders, listPaidOrders, listDeliveredOrders, updateOrderStatus } = require('../../Controller/Canteen/orderController');

// All routes require authenticated canteen token
router.get('/list', verifyToken, listOrders);
router.get('/paid', verifyToken, listPaidOrders);
router.get('/delivered', verifyToken, listDeliveredOrders);
// Update paymentStatus by transactionId only
router.patch('/:transactionId/status', verifyToken, updateOrderStatus);

module.exports = router;
