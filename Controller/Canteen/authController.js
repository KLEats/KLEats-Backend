const db = require("../../Config/mysqlDb.js");
const jwt = require("jsonwebtoken");

const isProduction = process.env.NODE_ENV === "production";

async function login(req, res) {
  const conn = await db.getConnection();

  try {
    const { CanteenId, Password } = req.body;
    console.log("Received CanteenId:", CanteenId);

    // Basic checks
    if (!CanteenId || !Password) {
      conn.release();
      return res.status(400).json({
        code: -1,
        message: "CanteenId and Password are required."
      });
    }

    // Ensure CanteenId is numeric only
    if (!/^\d+$/.test(CanteenId)) {
      conn.release();
      return res.status(400).json({
        code: -1,
        message: "Invalid CanteenId. Must contain only digits."
      });
    }

    const query = "SELECT * FROM canteen WHERE CanteenId = ?";
    const [result] = await conn.query(query, [CanteenId]);
    console.log("Query result:", result);
    conn.release();

    if (result.length === 0) {
      return res.status(404).json({
        code: -1,
        message: "Canteen not found."
      });
    }

    const canteen = result[0];

    if (Password !== canteen.password) {
      return res.status(401).json({
        code: 0,
        message: "Invalid Password."
      });
    }

    const token = jwt.sign(
      {
        CanteenId: canteen.CanteenId,
        role: 'admin',
      },
      process.env.SECRET_KEY,
      {
        algorithm: "HS512",
        expiresIn: "7d",
      }
    );

    // res.cookie("auth_token_lunchbox_admin", token, {
    //   httpOnly: true,
    //   secure: isProduction,
    //   sameSite: isProduction ? "Strict" : "Lax",
    //   maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    // });

    return res.status(200).json({
      code: 1,
      message: "Login Successful",
      token
    });

  } catch (err) {
    console.error("Login Error:", err);
    conn.release();
    return res.status(500).json({
      code: -1,
      message: "Internal Server Error"
    });
  }
}



async function logout(req, res) {
  try {
    res.clearCookie("auth_token_lunchbox_admin", {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "Strict" : "Lax",
    });

    return res.status(200).json({
      code: 1,
      message: "Logout successful."
    });

  } catch (err) {
    console.error("Logout error:", err);
    return res.status(500).json({
      code: -1,
      message: "Internal Server Error"
    });
  }
}


module.exports = {
  login,
  logout,
}