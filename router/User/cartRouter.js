const express=require("express");
const router=express.Router();

const cartController=require('../../Controller/User/cartController')


router.get('/addToCart',cartController.addToCart);
router.delete('/removeItemCart',cartController.removeFromCart);
router.delete('/clearCart',cartController.clearCart);
router.post('/updateCart',cartController.updateCart);
router.get('/getCartItems',cartController.getCartItems);

module.exports=router;