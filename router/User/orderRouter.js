const express=require("express");
const router=express.Router();
const orderController=require('../../Controller/User/orderController');


router.post("/placeOrder",orderController.placeOrder);
router.get("/getOrders",orderController.getOrders);

module.exports=router;