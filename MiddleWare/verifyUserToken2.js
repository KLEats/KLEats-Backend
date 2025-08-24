const jwt = require("jsonwebtoken");
const SECRET_KEY = process.env.SECRET_KEY;

const verifyUserToken = (req, res, next) => {
    // Prefer Authorization header; accept raw token or "Bearer <token>"
    let token = req.headers["authorization"];

    // Fallback to cookie if needed
    if (!token && req.cookies?.auth_token_lunchbox) {
        token = req.cookies.auth_token_lunchbox;
    }

    if (!token) {
        return res.status(401).json({ error: "Not authenticated" });
    }

    // Strip Bearer prefix if present
    if (typeof token === 'string' && token.toLowerCase().startsWith('bearer ')) {
        token = token.slice(7).trim();
    }

    try {
        const decoded = jwt.verify(token, SECRET_KEY);
        req.payload = decoded;
        next();
    } catch (error) {
        return res.json({ code: -1, message: "Invalid token." });
    }
}

module.exports =verifyUserToken;