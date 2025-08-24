const db = require("../../Config/mysqlDb.js");
const mailSender = require('../../Services/mailSender');
const jwt = require("jsonwebtoken");
const bcrypt = require('bcrypt');
const { strictTransportSecurity } = require("helmet");
const redis = require('../../Config/redisClint');
const e = require("express");
const { json } = require("body-parser");

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI;

const isProduction = process.env.NODE_ENV === "production";

async function sendEmailReg(req, res) {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        code: 0,
        message: "Invalid Data. Email is required.",
      });
    }

    const conn = await db.getConnection();
    try {
      let userExistResult = await conn.query("select exists( select 1 from User where Email=?) as emailExist", [email]);
      userExistResult = userExistResult[0];
      if (userExistResult[0].emailExist == 1) {
        return res.status(400).json({ code: 0, message: 'Email already exists.' });
      }
    } finally {
      conn.release();
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const hashedOtp = await bcrypt.hash(otp, 10);

    await redis.set("OTP:" + email, hashedOtp);

    const result = await mailSender.sendMailForRegister({ email: email, otp: otp });

    if (result == 1) {
      await redis.expire("OTP:" + email, 300);
      return res.status(200).json({ code: 1, message: 'OTP Sent Successfully.' });
    } else {
      await redis.del("OTP:" + email);
      return res.status(500).json({ code: 0, message: 'Failed to send Otp.' })
    }

  } catch (err) {
    console.error("Error in triggering otp: ", err);
    return res.status(500).json({ code: -1, message: "Internal server error" });
  }
}

async function verifyOtp(req, res) {
  try {
    const { email, otp, purpose } = req.body;

    if (!email || !otp || !purpose || !(purpose == 'register' || purpose == 'resetPassword')) {
      return res.json({ code: 0, message: 'Invalid Data.' });
    }

    const otpCache = await redis.get("OTP:" + email);

    if (!otpCache) {
      return res.status(400).json({ code: 0, message: "OTP has expired. Please request a new one." });
    }

    const isValid = await bcrypt.compare(otp, otpCache);
    if (isValid) {
      const token = jwt.sign({
        email: email,
        purpose: purpose
      }, process.env.SECRET_KEY, {
        algorithm: "HS512",
        expiresIn: "10m",
      });

      await redis.del("OTP:" + email);
      return res.status(200).json({ code: 1, message: "OTP verified successfully", token: token, warrning: 'This Token valid for only 10 minutes.' });
    } else {
      return res.status(400).json({ code: 0, message: 'Incorrect Otp' });
    }

  } catch (err) {
    console.error("Error in verifying OTP: ", err);
    return res.status(500).json({ code: -1, message: "Internal server error" });
  }
}

async function registerUser(req, res) {
  try {
    const { name, email, phoneNo, studentId, role, DayOrHos, EmpId, password } = req.body;

    if (!name || !email || !phoneNo || !role || !DayOrHos || !password || ((role === 'staff' && !EmpId) || (role === 'student' && !studentId))) {
      return res.status(400).json({ code: 0, message: 'Invalid data.' });
    }

    if (req.payload.email != email || req.payload.purpose != 'register') {
      return res.status(400).json({ code: 0, message: 'Cannot register user.' });
    }

    let query = '';
    let values = [];

    if (role == 'staff') {
      query = 'insert into User (Name,Email,PhoneNo,role,DayOrHos,EmpId,password) values(?,?,?,?,?,?,?)';
      values = [name, email, phoneNo, role, DayOrHos, EmpId, password];
    } else {
      query = 'insert into User (Name,Email,PhoneNo,role,DayOrHos,StudentId,password) values(?,?,?,?,?,?,?)';
      values = [name, email, phoneNo, role, DayOrHos, studentId, password];
    }

    const conn = await db.getConnection();

    try {
      const result = await conn.query(query, values);

      if (result[0].affectedRows > 0) {
        return res.status(200).json({ code: 1, message: "Successfully Registered." });
      } else {
        return res.status(500).json({ code: 0, message: "Failed to Register." });
      }
    } catch (err) {
      console.error("Error while inserting data: ", err);
      return res.status(500).json({ code: -1, message: "Problem while inserting data." });
    }
    finally {
      conn.release();
    }

  } catch (err) {
    return res.json({ code: -1, message: "Internal server error" });
  }
}


async function login(req, res) {

  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.json({ code: 0, message: 'Invalid data' });
    }

    const conn = await db.getConnection();
    await conn.query('select userId,StudentId,role,password from User where email=?', [email])
      .then(result => {
        conn.release();
        result = result[0];
        if (result.length > 0) {
          if (result[0].password == password) {

            const token = jwt.sign({
              userId: result[0].userId,
              role: result[0].role,
            }, process.env.SECRET_KEY, {
              algorithm: "HS512",
              expiresIn: "7d",
            });

            return res.json({ code: 1, message: "Login in Successfully.", token: token });
          } else {
            return res.json({ code: 0, message: 'Incorrect Password' });
          }
        } else {
          return res.json({ code: 0, message: 'Email not found.' });
        }
      }).catch(err => {
        conn.release();
        return res.json({ code: -1, message: 'Not abul to retrive data.' });
      });


  } catch (err) {
    console.log(err);
    return res.json({ code: -1, message: 'Internal server error.' });
  }

}


async function sendEmailForResetPassword(req, res) {
  try {
    const { email } = req.body;

    if (!email) {
      return res.json({ code: 0, message: "Invalid data." });
    }

    const conn = await db.getConnection();

    let userExistResult = await conn.query("select exists( select 1 from User where Email=?) as emailExist", [email]);
    userExistResult = userExistResult[0];
    conn.release();
    if (userExistResult[0].emailExist == 0) {
      return res.json({ code: 0, message: 'Email does not found.' });
    }


    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const hashedOtp = "" + await bcrypt.hash(otp, 10);
    //await conn.query("insert into OtpTable (email,otp,created_at) values(?,?,now())",[email,hashedOtp]);
    await redis.set("OTP:" + email, hashedOtp);
    const result = await mailSender.sendMailForReset({ email: email, otp: otp });

    if (result == 1) {
      await redis.expire("OTP:" + email, 300);
      return res.json({ code: 1, message: 'OTP Sent Successfully.' });
    } else {
      // await conn.query("delete from OtpTable where email=? and otp=?",[email,otp]);
      // conn.release();
      await redis.del("OTP:" + email);
      return res.json({ code: 0, message: 'Failed to send Otp.' })
    }


  } catch (err) {
    console.log("Error in triggering otp: " + err);
    return res.json({ code: -1, message: "Internal server error" });
  }
}

async function resetPassword(req, res) {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.json({ code: 0, message: 'Invalid Data' });
    }

    if (req.payload.email != email || req.payload.purpose != 'resetPassword') {
      return res.json({ code: 0, message: 'Cannot reset password.' });
    }

    const conn = await db.getConnection();
    await conn.query('update User set password=? where email=?', [password, email]).then(result => {

      conn.release();

      if (!(result[0].affectedRows > 0)) {
        return res.json({ code: 0, message: 'Password not Reseted.' });
      }

      return res.json({ code: 1, message: 'Password Reseted successfully.' });

    }).catch(err => {
      conn.release();
      console.log("Error:" + err);
      return res.json({ code: -1, message: 'Failed to update password.' });
    });

  } catch (err) {
    return res.json({ code: -1, message: 'Internal server error.' });
  }
}

async function getProfile(req, res) {
  try {
    const userId = req.payload.userId;
    //console.log(userId);

    const conn = await db.getConnection();

    conn.query('select * from User where userId=?', [userId])
      .then(result => {
        conn.release();
        return res.json({ code: -1, data: result[0] });
      }).catch(err => {
        console.log(err.message);
        return res.json({ code: 0, message: 'Error while fetching user data.' });
      });

    //return res.json({code:-1});

  } catch (err) {
    return res.json({ code: -1, message: "Error" });
  }
}

async function loginWithOauth(req, res) {

  let conn;

  try {
  // Accept optional code_verifier (PKCE) and optional redirect_uri override from client
  const { code, code_verifier, redirect_uri: redirectUriOverride } = req.body;
    console.log("OAuth code received:", code);

    if (!code) {
      return res.status(400).json({ error: "Authorization code is required" });
    }

    // Log OAuth configuration for debugging
  console.log("OAuth Configuration:");
    console.log("Client ID:", GOOGLE_CLIENT_ID ? "Set" : "Not set");
    console.log("Client Secret:", GOOGLE_CLIENT_SECRET ? "Set" : "Not set");
  console.log("Redirect URI:", GOOGLE_REDIRECT_URI);
    
    // Check if any environment variables are missing
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REDIRECT_URI) {
      console.error("Missing OAuth environment variables:");
      console.error("GOOGLE_CLIENT_ID:", !!GOOGLE_CLIENT_ID);
      console.error("GOOGLE_CLIENT_SECRET:", !!GOOGLE_CLIENT_SECRET);
      console.error("GOOGLE_REDIRECT_URI:", !!GOOGLE_REDIRECT_URI);
      return res.status(500).json({ error: "OAuth configuration is incomplete" });
    }

    // Use the redirect URI from env by default; allow explicit override if provided and matches allowed value
    const effectiveRedirectUri = redirectUriOverride || GOOGLE_REDIRECT_URI;

    const tokenRequestBody = new URLSearchParams({
      code,
      client_id: GOOGLE_CLIENT_ID,
      // If your client used PKCE, you must include the exact code_verifier used to create the code_challenge
      redirect_uri: effectiveRedirectUri,
      grant_type: "authorization_code",
    });

    // Conditionally include client_secret and/or code_verifier
    // - For standard web app flow: client_secret is required
    // - For PKCE: include code_verifier in addition to client_secret (or instead if using a public client)
    if (GOOGLE_CLIENT_SECRET) tokenRequestBody.append("client_secret", GOOGLE_CLIENT_SECRET);
    if (code_verifier) tokenRequestBody.append("code_verifier", code_verifier);

    console.log("Token request body (without client_secret):", {
      code,
      client_id: GOOGLE_CLIENT_ID,
      redirect_uri: effectiveRedirectUri,
      grant_type: "authorization_code",
      code_verifier: code_verifier ? "[provided]" : undefined,
    });

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: tokenRequestBody,
    });

    if (!tokenRes.ok) {
      let errorInfo;
      try {
        errorInfo = await tokenRes.json();
      } catch (_) {
        errorInfo = { status: tokenRes.status, statusText: tokenRes.statusText };
      }
      console.error("Google OAuth Error Response:", errorInfo);
      const msg = errorInfo.error_description || errorInfo.error || tokenRes.statusText || "Bad Request";
      throw new Error(`Token exchange failed: ${msg}`);
    }

    const { id_token, access_token } = await tokenRes.json();

    const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: {
        Authorization: `Bearer ${access_token}`,
      },
    });

    if (!userInfoRes.ok) {
      throw new Error("Failed to fetch user info from Google");
    }

    const { sub, email, name, picture } = await userInfoRes.json();
    console.log("Google user info:", { sub, email, name });

    conn = await db.getConnection();

    const [users] = await conn.execute(
      "SELECT userId, email, name FROM users WHERE googleId = ?",
      [sub]
    );

    let userId;

    if (users.length === 0) {
      // 5. Insert new user
      const [insertResult] = await conn.execute(
        `INSERT INTO users (googleId, email, name) VALUES (?, ?, ?)`,
        [sub, email, name]
      );
      userId = insertResult.insertId;
    } else {
      userId = users[0].userId;
    }

    console.log("User ID for token generation:", userId);

    const token = jwt.sign({
      userId: userId
    }, process.env.SECRET_KEY, {
      algorithm: "HS512",
      expiresIn: "7d",
    });

    // Print user token to console after Google OAuth
    console.log("User token after Google OAuth:", token);

    // res.cookie("auth_token_lunchbox", token, {
    //   httpOnly: true,
    //   secure: isProduction,
    //   sameSite: isProduction ? "Strict" : "Lax",
    //   maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    // });

    res.status(200).json({
      message: "Login successful",
      user: {
        userId,
        name,
        email,
      },
      token
    });

  } catch (err) {
    console.error("Error in loginWithOauth:", err);
    return res.status(500).json({ error: "Internal server error" });
  } finally {
    if(conn) conn.release();
  }
}

// Check if phone number is 0 for a user by token
async function checkPhoneNumberStatus(req, res) {
  let conn;
  
  try {
    const userId = req.payload.userId;
    
    if (!userId) {
      return res.status(400).json({ 
        code: 0, 
        message: "User ID not found in token" 
      });
    }

    conn = await db.getConnection();
    
    const [users] = await conn.execute(
      "SELECT phoneNo, googleId FROM users WHERE userId = ?",
      [userId]
    );

    if (users.length === 0) {
      return res.status(404).json({ 
        code: 0, 
        message: "User not found with this User ID" 
      });
    }

    const phoneNo = users[0].phoneNo;
    const googleId = users[0].googleId;
    const isPhoneZero = phoneNo === 0 || phoneNo === '0' || phoneNo === null;

    console.log(`Phone number check for User ID ${userId} (Google ID: ${googleId}): ${phoneNo} (isZero: ${isPhoneZero})`);

    return res.status(200).json({
      code: 1,
      message: "Phone number status retrieved successfully",
      data: {
        userId,
        googleId,
        phoneNo,
        isPhoneZero
      }
    });

  } catch (err) {
    console.error("Error in checkPhoneNumberStatus:", err);
    return res.status(500).json({ 
      code: -1, 
      message: "Internal server error" 
    });
  } finally {
    if (conn) conn.release();
  }
}

// Fill user data using token
async function fillUserData(req, res) {
  let conn;
  
  try {
    console.log("fillUserData called with body:", req.body);
    console.log("fillUserData called with payload:", req.payload);
    
    const userId = req.payload.userId;
    const { 
      phoneNo, 
      role, 
      DayOrHos
    } = req.body;
    
    console.log("Extracted values:", { userId, phoneNo, role, DayOrHos });
    
    if (!userId) {
      return res.status(400).json({ 
        code: 0, 
        message: "User ID not found in token" 
      });
    }

    if (!phoneNo || !role || !DayOrHos) {
      return res.status(400).json({ 
        code: 0, 
        message: "Phone number, role, and DayOrHos are required" 
      });
    }

    // Validate role enum values
    if (!['student', 'staff'].includes(role)) {
      return res.status(400).json({ 
        code: 0, 
        message: "Role must be either 'student' or 'staff'" 
      });
    }

    // Validate DayOrHos enum values
    if (!['hostel', 'DayScoller'].includes(DayOrHos)) {
      return res.status(400).json({ 
        code: 0, 
        message: "DayOrHos must be either 'hostel' or 'DayScoller'" 
      });
    }

    conn = await db.getConnection();
    
    // Check if user exists
    const [existingUsers] = await conn.execute(
      "SELECT userId, googleId FROM users WHERE userId = ?",
      [userId]
    );

    if (existingUsers.length === 0) {
      return res.status(404).json({ 
        code: 0, 
        message: "User not found with this User ID" 
      });
    }

    const googleId = existingUsers[0].googleId;

    // Validate that Google ID is numeric
    if (!googleId || isNaN(googleId)) {
      return res.status(400).json({ 
        code: 0, 
        message: "Invalid Google ID format" 
      });
    }

    // Update user data - only update existing columns
    const query = 'UPDATE users SET phoneNo = ?, role = ?, DayOrHos = ? WHERE googleId = ?';
    const values = [phoneNo, role, DayOrHos, googleId];

    const [result] = await conn.execute(query, values);

    if (result.affectedRows > 0) {
      console.log(`User data updated for User ID ${userId} (Google ID: ${googleId}):`, {
        phoneNo,
        role,
        DayOrHos
      });

      return res.status(200).json({
        code: 1,
        message: "User data updated successfully",
        data: {
          userId,
          googleId,
          phoneNo,
          role,
          DayOrHos
        }
      });
    } else {
      return res.status(500).json({ 
        code: 0, 
        message: "Failed to update user data" 
      });
    }

  } catch (err) {
    console.error("Error in fillUserData:", err);
    console.error("Error stack:", err.stack);
    return res.status(500).json({ 
      code: -1, 
      message: "Internal server error",
      error: err.message 
    });
  } finally {
    if (conn) conn.release();
  }
}

async function logout(req,res) {
  try{
    res.clearCookie('auth_token_lunchbox',{
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "Strict" : "Lax",
    });

    return res.json({code:1,message:'Logout Success.'});
  }catch(err){
    return res.json({code:-1,message:'Internal server error.'});
  }
}


async function test(req, res) {
  try {
    return res.json({ data: req.payload });
  } catch (err) {
    return res.json({ data: "" });
  }
}

// Fetch user data from token
async function getUserDataFromToken(req, res) {
  let conn;
  
  try {
    console.log("=== getUserDataFromToken Function Called ===");
    console.log("Request headers:", req.headers);
    console.log("Request payload:", req.payload);
    console.log("Request body:", req.body);
    console.log("Request method:", req.method);
    console.log("Request URL:", req.url);
    
    const userId = req.payload.userId;
    console.log("Extracted userId from token:", userId);
    
    if (!userId) {
      console.log("ERROR: User ID not found in token");
      return res.status(400).json({ 
        code: 0, 
        message: "User ID not found in token" 
      });
    }

    console.log("Getting database connection...");
    conn = await db.getConnection();
    console.log("Database connection acquired successfully");
    
    const query = "SELECT userId, googleId, phoneNo, role, DayOrHos, name, email FROM users WHERE userId = ?";
    console.log("Executing query:", query);
    console.log("Query parameters:", [userId]);
    
    // Fetch user data from the users table - only select columns that exist
    const [users] = await conn.execute(query, [userId]);
    console.log("Query executed successfully");
    console.log("Raw query result:", users);
    console.log("Number of users found:", users.length);

    if (users.length === 0) {
      console.log("ERROR: No user found with userId:", userId);
      return res.status(404).json({ 
        code: 0, 
        message: "User not found with this User ID" 
      });
    }

    const userData = users[0];
    console.log("User data found:", userData);
    console.log("Individual user data fields:");
    console.log("- userId:", userData.userId);
    console.log("- googleId:", userData.googleId);
    console.log("- phoneNo:", userData.phoneNo);
    console.log("- role:", userData.role);
    console.log("- DayOrHos:", userData.DayOrHos);
    console.log("- name:", userData.name);
    console.log("- email:", userData.email);

    const responseData = {
      code: 1,
      message: "User data retrieved successfully",
      data: {
        userId: userData.userId,
        googleId: userData.googleId,
        phoneNo: userData.phoneNo,
        role: userData.role,
        DayOrHos: userData.DayOrHos,
        name: userData.name,
        email: userData.email
      }
    };
    
    console.log("Sending response:", responseData);
    return res.status(200).json(responseData);

  } catch (err) {
    console.error("=== ERROR in getUserDataFromToken ===");
    console.error("Error message:", err.message);
    console.error("Error stack:", err.stack);
    console.error("Error code:", err.code);
    console.error("Error sqlMessage:", err.sqlMessage);
    console.error("Error sqlState:", err.sqlState);
    console.error("Full error object:", err);
    
    return res.status(500).json({ 
      code: -1, 
      message: "Internal server error",
      error: err.message 
    });
  } finally {
    if (conn) {
      console.log("Releasing database connection");
      conn.release();
    }
    console.log("=== getUserDataFromToken Function Completed ===");
  }
}

// Edit user data from token
async function editUserData(req, res) {
  let conn;
  
  try {
    console.log("=== editUserData Function Called ===");
    console.log("Request headers:", req.headers);
    console.log("Request payload:", req.payload);
    console.log("Request body:", req.body);
    console.log("Request method:", req.method);
    console.log("Request URL:", req.url);
    
    const userId = req.payload.userId;
    console.log("Extracted userId from token:", userId);
    
    if (!userId) {
      console.log("ERROR: User ID not found in token");
      return res.status(400).json({ 
        code: 0, 
        message: "User ID not found in token" 
      });
    }

    const { 
      phoneNo, 
      role, 
      DayOrHos,
      name,
      email
    } = req.body;
    
    console.log("Extracted values from body:", { phoneNo, role, DayOrHos, name, email });
    
    // Check if at least one field is provided for update
    if (!phoneNo && !role && !DayOrHos && !name && !email) {
      console.log("ERROR: No fields provided for update");
      return res.status(400).json({ 
        code: 0, 
        message: "At least one field (phoneNo, role, DayOrHos, name, email) is required for update" 
      });
    }

    // Validate role enum values if provided
    if (role && !['student', 'staff'].includes(role)) {
      console.log("ERROR: Invalid role value:", role);
      return res.status(400).json({ 
        code: 0, 
        message: "Role must be either 'student' or 'staff'" 
      });
    }

    // Validate DayOrHos enum values if provided
    if (DayOrHos && !['hostel', 'DayScoller'].includes(DayOrHos)) {
      console.log("ERROR: Invalid DayOrHos value:", DayOrHos);
      return res.status(400).json({ 
        code: 0, 
        message: "DayOrHos must be either 'hostel' or 'DayScoller'" 
      });
    }

    console.log("Getting database connection...");
    conn = await db.getConnection();
    console.log("Database connection acquired successfully");
    
    // Check if user exists
    const [existingUsers] = await conn.execute(
      "SELECT userId, googleId FROM users WHERE userId = ?",
      [userId]
    );

    if (existingUsers.length === 0) {
      console.log("ERROR: User not found with userId:", userId);
      return res.status(404).json({ 
        code: 0, 
        message: "User not found with this User ID" 
      });
    }

    const googleId = existingUsers[0].googleId;
    console.log("Found user with googleId:", googleId);

    // Build dynamic update query based on provided fields
    const updateFields = [];
    const updateValues = [];
    
    if (phoneNo !== undefined) {
      updateFields.push('phoneNo = ?');
      updateValues.push(phoneNo);
    }
    if (role !== undefined) {
      updateFields.push('role = ?');
      updateValues.push(role);
    }
    if (DayOrHos !== undefined) {
      updateFields.push('DayOrHos = ?');
      updateValues.push(DayOrHos);
    }
    if (name !== undefined) {
      updateFields.push('name = ?');
      updateValues.push(name);
    }
    if (email !== undefined) {
      updateFields.push('email = ?');
      updateValues.push(email);
    }
    
    updateValues.push(googleId); // Add googleId for WHERE clause
    
    const query = `UPDATE users SET ${updateFields.join(', ')} WHERE googleId = ?`;
    console.log("Update query:", query);
    console.log("Update values:", updateValues);

    const [result] = await conn.execute(query, updateValues);
    console.log("Update result:", result);

    if (result.affectedRows > 0) {
      console.log(`User data updated successfully for User ID ${userId} (Google ID: ${googleId})`);
      
      // Fetch updated user data
      const [updatedUsers] = await conn.execute(
        "SELECT userId, googleId, phoneNo, role, DayOrHos, name, email FROM users WHERE userId = ?",
        [userId]
      );
      
      const updatedUserData = updatedUsers[0];
      console.log("Updated user data:", updatedUserData);

      const responseData = {
        code: 1,
        message: "User data updated successfully",
        data: {
          userId: updatedUserData.userId,
          googleId: updatedUserData.googleId,
          phoneNo: updatedUserData.phoneNo,
          role: updatedUserData.role,
          DayOrHos: updatedUserData.DayOrHos,
          name: updatedUserData.name,
          email: updatedUserData.email
        }
      };
      
      console.log("Sending response:", responseData);
      return res.status(200).json(responseData);
    } else {
      console.log("ERROR: No rows affected during update");
      return res.status(500).json({ 
        code: 0, 
        message: "Failed to update user data" 
      });
    }

  } catch (err) {
    console.error("=== ERROR in editUserData ===");
    console.error("Error message:", err.message);
    console.error("Error stack:", err.stack);
    console.error("Error code:", err.code);
    console.error("Error sqlMessage:", err.sqlMessage);
    console.error("Error sqlState:", err.sqlState);
    console.error("Full error object:", err);
    
    return res.status(500).json({ 
      code: -1, 
      message: "Internal server error",
      error: err.message 
    });
  } finally {
    if (conn) {
      console.log("Releasing database connection");
      conn.release();
    }
    console.log("=== editUserData Function Completed ===");
  }
}




module.exports = {
  registerUser,
  sendEmailReg,
  verifyOtp,
  login,
  sendEmailForResetPassword,
  resetPassword,
  test,
  getProfile,
  loginWithOauth,
  logout,
  checkPhoneNumberStatus,
  fillUserData,
  getUserDataFromToken,
  editUserData,
}