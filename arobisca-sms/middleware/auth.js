// middleware/auth.js
const jwt = require("jsonwebtoken");

const protect = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Not authorized, no token" });
  }

  const token = authHeader.split(" ")[1];
  const jwtSecret = process.env.AROBISCA_SMS_JWT_SECRET || process.env.JWT_SECRET;

  try {
    const decoded = jwt.verify(token, jwtSecret);
    req.user = decoded; // ✅ user info from token
    next();
  } catch (error) {
    return res.status(401).json({ message: "Not authorized, token failed" });
  }
};

module.exports = protect;
