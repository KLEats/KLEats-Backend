const express=require('express')
const router=express.Router();

const controller=require('../../Controller/Canteen/itemController');



router.get('/getItems',controller.CanteengetItems);
router.delete('/remove',controller.deleteItem);
router.patch('/updateData',controller.updateItemData);
router.post('/add',controller.addItem);
router.patch('/updateImages',controller.updateItemImages);
router.post('/add-category',controller.addCategory);
router.post('/edit-category',controller.editCategory);
router.get('/categories', controller.getCategoryCanteen);
router.get('/items-by-category', controller.getItemsByCategory);
router.get('/get-category-all',controller.getCategoryAll);

module.exports=router