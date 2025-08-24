const express = require('express');
const router = express.Router();
const controller = require('../../Controller/Canteen/userController');

router.get('/get-user-details', controller.getUserProfile);


module.exports = router;