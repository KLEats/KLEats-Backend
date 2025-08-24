const express = require('express');
const router = express.Router();

const controller=require('../../Controller/Admin/categoresController');

router.post('/add-category-global',controller.addCategory);
router.patch('/update-category-image',controller.updateCategoryImage);
router.get('/all-categories',controller.getAllCategories);

module.exports = router;