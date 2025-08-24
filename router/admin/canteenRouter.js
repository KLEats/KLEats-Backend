const express = require('express');
const router = express.Router();
const controller = require('../../Controller/Admin/canteenController');

router.post('/', controller.createCanteen);
router.patch('/:id', controller.updateCanteen);
router.get('/:id', controller.getCanteen);
router.get('/', controller.listCanteens);
router.delete('/:id', controller.deleteCanteen);

module.exports = router;
