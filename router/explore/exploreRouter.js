const express=require("express");
const router=express.Router();

const itemsExplore=require('../../Controller/Explore/Items/itemController');
router.get('/items',itemsExplore.getItemsByCanteen);
router.get('/item',itemsExplore.getItemById);
router.get('/search/items', itemsExplore.searchItems);

const cartsExplore=require('../../Controller/Explore/canteen/canteenController');
router.get('/canteens',cartsExplore.getCanteens);
router.get('/canteen/details/:canteen_id',cartsExplore.getCanteenById);


router.get('/categories',cartsExplore.getAllCategories);
router.get('/get/items-by-category/:category_name',itemsExplore.getItemsByCategory);
router.get('/canteen/:canteen_id/items-by-category/all/:category_name', itemsExplore.getItemsByCategoryForCanteenAll);
router.get('/canteen/categories/:canteen_id', cartsExplore.getCanteenCategories);
router.get('/get/popular-items', itemsExplore.getPopularItems);


module.exports=router;