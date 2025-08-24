const express = require("express");
const helmet = require("helmet");
const dotenv = require("dotenv");
const morgan = require("morgan");
const bodyParser = require("body-parser");
const cors = require("cors");
const compression = require("compression");
const fileUpload = require("express-fileupload");
const cookieParser = require("cookie-parser");
const rateLimit = require("express-rate-limit");
const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");

dotenv.config();

const app = express();

<<<<<<< HEAD
// Import payment handlers early so we can wire webhook before parsers
const { handlePaymentResponse, juspayWebhook, cashfreeWebhook } = require('./Controller/User/orderController');

// Middleware
app.use(express.static('public'));
// Cashfree webhook MUST receive raw body for signature verification; register before JSON parsers
app.post('/cashfree/webhook', express.raw({ type: '*/*' }), cashfreeWebhook);
=======
// Middleware
app.use(express.static('public'));
>>>>>>> ce735365d6832a60de1ab0dcedab42e944a3684c
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(cors({
  origin: "*",
  credentials: false,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"]                
}));
app.use(helmet());
app.use(compression());
app.use(fileUpload({
  limits: { fileSize: 50 * 1024 * 1024 },
  abortOnLimit: true,
  safeFileNames: true,
  preserveExtension: true,
}));
// app.use(morgan());

// const limiter = rateLimit({
//   windowMs: 15 * 60 * 1000,
//   max: 10,
// });
// app.use(limiter);



const verifyToken=require("./MiddleWare/verifyUserToken");
const verifyUserToken=require("./MiddleWare/verifyUserToken2");
const verifyAdminToken=require("./MiddleWare/verifyAdminToken");

const PORT = process.env.PORT || 3000;
const SSL_KEY_PATH = process.env.SSL_KEY_PATH;
const SSL_CERT_PATH = process.env.SSL_CERT_PATH;

/*app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});*/


//admin-login
const CanteenAuthRouter=require('./router/Canteen/authRounter')
app.use('/api/Canteen/auth',CanteenAuthRouter);

// super admin
const AdminAuthRouter=require('./router/admin/authRouter');
app.use('/api/admin/auth', AdminAuthRouter);
const AdminCanteenRouter=require('./router/admin/canteenRouter');
app.use('/api/admin/canteen', verifyAdminToken, AdminCanteenRouter);
const AdminCategoryRouter=require('./router/admin/categoryRouter');
app.use('/api/admin/category', verifyAdminToken, AdminCategoryRouter);

//whatsapp
const WhatsappRouter = require("./router/whatsapp/whatsappRoutes");
app.use("/api/whatsapp", WhatsappRouter);

// telegram actions (button callbacks) - auth via telegramId whitelist per canteen
const TelegramOrderRouter = require('./router/telegram/orderRouter');
app.use('/api/telegram', TelegramOrderRouter);

// Telegram webhook to receive callback_query updates (no auth)
const TelegramWebhookRouter = require('./router/telegram/webhookRouter');
app.use('/telegram', TelegramWebhookRouter);

// Simple ping to verify HTTPS proxy reaches backend
app.get('/telegram/ping', (req, res) => {
  res.json({ ok: true, route: '/telegram/ping', ts: new Date().toISOString() });
});

//admin-items
const CanteenItemRouter=require("./router/Canteen/itemRouter")
app.use('/api/Canteen/item',verifyToken,CanteenItemRouter);

// canteen orders
const CanteenOrderRouter = require('./router/Canteen/orderRouter');
app.use('/api/Canteen/order', verifyToken, CanteenOrderRouter);

//
const userCanteenRouter=require('./router/Canteen/userRouter');
app.use('/api/Canteen/user', verifyToken, userCanteenRouter);

//User-auth
const UserAuthRouter=require('./router/User/authRouter');
app.use('/api/User/auth',UserAuthRouter);

//User-items
const UserItemRouter=require('./router/User/itemRouter');
app.use('/api/User/item',verifyToken,UserItemRouter);

//User-cart
const UserCartRouter=require('./router/User/cartRouter');
app.use('/api/User/cart',verifyUserToken,UserCartRouter);

// Payment response handler - no auth required as it's called by HDFC
// IMPORTANT: Define these BEFORE the authenticated order routes
<<<<<<< HEAD
// Handlers already imported above
=======
const {handlePaymentResponse,juspayWebhook,cashfreeWebhook}=require('./Controller/User/orderController');
>>>>>>> ce735365d6832a60de1ab0dcedab42e944a3684c

// Test endpoint to verify the route is accessible - outside order routes
app.get('/api/test-payment', (req, res) => {
    res.json({ message: "Payment test endpoint working", timestamp: new Date().toISOString() });
});

// Payment response endpoints - no auth required
// These must be defined BEFORE any middleware that could interfere
app.get('/api/User/order/handlePaymentResponse', (req, res, next) => {
    console.log("=== GET handlePaymentResponse route hit ===");
    console.log("Request URL:", req.url);
    console.log("Request method:", req.method);
    next();
}, handlePaymentResponse);

app.post('/api/User/order/handlePaymentResponse', (req, res, next) => {
    console.log("=== POST handlePaymentResponse route hit ===");
    console.log("Request URL:", req.url);
    console.log("Request method:", req.method);
    next();
}, handlePaymentResponse);

app.post('/juspay/webhook', juspayWebhook);

<<<<<<< HEAD
// Cashfree webhook is registered earlier before body parsers
=======
// Cashfree webhook (no auth) - use raw body for signature verification
app.post('/cashfree/webhook', express.raw({ type: '*/*' }), cashfreeWebhook);
>>>>>>> ce735365d6832a60de1ab0dcedab42e944a3684c

//User-Order
const UserOrderRouter=require('./router/User/orderRouter');
app.use('/api/User/order',verifyUserToken,UserOrderRouter);

// User-Payment (no auth for verify endpoint as per requirements)
const UserPaymentRouter = require('./router/User/paymentRouter');
app.use('/api/User/payment', UserPaymentRouter);

//explore
const ExploreRouter=require('./router/explore/exploreRouter');
app.use('/api/explore',ExploreRouter);

// app.post("/test/order",(req,res)=>{
//   try{
//     // const {name,rollNo,orderId,items,total,time}=req.body.tem;
//     // const numbers=req.body.numbers;

//     res.redirect('/api/whatsapp');
//   }catch(Exceprion){
//     console.log(Exceprion);
//     return res.json({code:-1,message:'internal server error.'});
//   }
// })




app.patch("/test",(req,res)=>{

  let obj=req.query.tree;
  let obj2=req.body;
  console.log(obj);
  console.log(obj2);

    res.json({code:17 , message: 'Test Api' , data: [
          {
            name: 'Praneeth',
            id: '2300090274',
            list: [9 , 9 , 9]
          }
      ]})
});


app.post('/test/files/',async (req,res)=>{


  try{
    const file=req.files.img;
    console.log(file);
  //  if(file.length==0){
  //   throw new 
  //  }
  fs.rmSync('public/'+file.name);
  //console.log(file);
  //throw new Error("Failed tree");
  }catch(err){
    return res.json({code:0,message:err.message});
  }

  // const dir = path.join(__dirname, 'public/images/tree/7878/');
  //   if (!fs.existsSync(dir)) {
  //     fs.mkdirSync(dir, { recursive: true });  // Create directory recursively
  //   }

    

   //image url: http://localhost:5000/images/img1.jpeg

  // for(let i=0;i<file.length;i++){
  //   await file[i].mv('public/images/tree/'+file[i].name);
  // }
  return res.json({code:1});
});


// const conr=require('./Controller/Explore/canteen/canteenController');
// app.get('/test/getData',conr.getCanteens);



// const rter=require('./Controller/User/authController');
// app.get('/test/profile',verifyToken,rter.getProfile);

// Catch-all route for debugging
app.use('*', (req, res) => {
  console.log(`=== CATCH-ALL ROUTE ===`);
  console.log(`Method: ${req.method}`);
  console.log(`URL: ${req.url}`);
  console.log(`Original URL: ${req.originalUrl}`);
  res.status(404).json({ 
    error: "Route not found", 
    method: req.method, 
    url: req.url,
    message: "This route is not defined in the application"
  });
});


// Start HTTP server on port 3000
app.listen(PORT, () => {
  console.log(`HTTP server is running on port ${PORT}`);
});


