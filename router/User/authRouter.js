const express=require("express");
const verifyToken=require("../../MiddleWare/verifyUserToken")
const router=express.Router();

const controller=require('../../Controller/User/authController');
const verifyUserToken = require("../../MiddleWare/verifyUserToken2");

router.post('/triggerOtpRes',controller.sendEmailReg);
router.post('/verifyOtp',controller.verifyOtp);
router.post('/login',controller.login);
router.post('/triggerOtpRest',controller.sendEmailForResetPassword);

router.post('/resetPassword',verifyToken,controller.resetPassword);
router.post('/registerUser',verifyToken,controller.registerUser);
router.post('/profile',verifyToken,controller.getProfile);

router.post('/test',verifyToken,controller.test);

router.post('/login-oauth',controller.loginWithOauth);
router.get('/logout',controller.logout);

// New endpoints for Google OAuth user data management
router.post('/check-phone-status',verifyUserToken,controller.checkPhoneNumberStatus);
router.post('/fill-user-data',verifyUserToken,controller.fillUserData);
router.get('/get-user-data',verifyUserToken,controller.getUserDataFromToken);
router.put('/edit-user-data',verifyUserToken,controller.editUserData);

module.exports=router;