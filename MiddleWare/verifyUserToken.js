const jwt = require("jsonwebtoken");
const SECRET_KEY = process.env.SECRET_KEY;

const verifyToken = (req, res, next) => {
  // const token = req.cookies?.auth_token_lunchbox_admin;
  const token = req.headers["authorization"];

    if (!token) {
        return res.status(401).json({ error: "Not authenticated" });
    }

  try {
    const decoded = jwt.verify(token, SECRET_KEY);

    req.payload = decoded;

    next();
  } catch (error) {
    return res.json({code:-1 , message: "Invalid token." });
  }
};

// const verifyToken=(req,res,next)=>{
//   const token = req.headers["authorization"];
//   console.log("Middle Ware",token);
//   req.payload="Praneeth";
//   console.log(req);
//   next();
// }

module.exports = verifyToken