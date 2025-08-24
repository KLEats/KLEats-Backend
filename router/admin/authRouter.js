const express = require('express');
const router = express.Router();
const controller = require('../../Controller/Admin/authController');

router.post('/login', controller.adminLogin);

module.exports = router;
