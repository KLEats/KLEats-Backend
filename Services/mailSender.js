const MAIL=process.env.NODE_MAIL;
const PASSWORD=process.env.NODE_PASSWORD;
const HOST=process.env.NODE_HOST;
const PORT=process.env.NODE_PORT;

const nodemailer=require("nodemailer");

const transporter=nodemailer.createTransport({
  host:HOST,  
  secureConnection:false,
  port:PORT,
  tls:{
    chipers: 'SSLv3'
  },
  auth:{
    user:MAIL,
    pass:PASSWORD
  },
});

async function sendMailForRegister(data) {
  try{
    const {email,otp} =data;

    const mailOptions={
      from:{
        name:'Lunch Box',
        address:MAIL
      },
      //from:MAIL,
      to:email,
      subject:'Email Verification',
      html:`
      <h3>Greeting from Lunch Box</h3>
      <p>Your otp for email verification: ${otp}</p>
      `,
    };

    const status=await transporter.sendMail(mailOptions);
    transporter.close();
    return status?1:0;
  }catch(err){
    console.log("Failed to send otp mail: "+err);
    return 0;
  }
}

async function sendMailForReset(data) {

  try{
    const {email,otp}=data;

    const mailOptions={
      from:{
        name:'Lunch Box',
        address:MAIL
      },
      //from:MAIL,
      to:email,
      subject:'Email Verification',
      html:`
      <h3>WelCome Back!!</h3>
      <p>Your otp to Reset Password: ${otp}</p>
      `,
    };

    const status=await transporter.sendMail(mailOptions);
    transporter.close();
    return status?1:0;

  }catch(err){
    console.log("Failed to send otp mail: "+err);
    return 0;
  }
  
}

module.exports={
  sendMailForRegister,
  sendMailForReset
}