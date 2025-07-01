// middleware/authJwt.js
const jwt = require("jsonwebtoken");
const User = require("../models/user.model"); // You might not even need User model here if roles are in token
require("dotenv").config();

const verifyToken = (req, res, next) => {
    const authHeader = req.headers["authorization"];
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(403).send({ message: "Không có token được cung cấp!" });
    }

    const token = authHeader.split(" ")[1];

    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        if (err) {
            // Provide more specific error messages for debugging
            if (err.name === 'TokenExpiredError') {
                return res.status(401).send({ message: "Token đã hết hạn!" });
            }
            return res.status(401).send({ message: "Token không hợp lệ!" });
        }

        // Correctly attach id and roles from the decoded token to the request object
        req.userId = decoded.id;
        req.roles = decoded.roles; // <-- THIS IS THE CRUCIAL CHANGE: Use 'decoded.roles' (plural)

        next();
    });
};

const isAdmin = (req, res, next) => {
    // 1. Kiểm tra xem req.roles có tồn tại và là một mảng không
    // This check is now redundant if you trust your token generation/decoding,
    // but it's good for robustness against malformed tokens.
    if (!req.roles || !Array.isArray(req.roles)) {
        return res.status(403).send({ message: "Truy cập bị từ chối! Thông tin vai trò không hợp lệ trong token." });
    }

    // 2. Kiểm tra xem mảng roles có bao gồm "admin" hay không
    if (req.roles.includes("admin")) {
        next(); // Nếu có vai trò "admin", cho phép truy cập
    } else {
        res.status(403).send({ message: "Yêu cầu vai trò Admin!" }); // Nếu không có vai trò "admin", từ chối
    }
};

const requireLogin = (req, res, next) => {
  const token = req.cookies?.refresh_token || (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.split(' ')[1] : null);

  if (!token) {
    const loginUrl = `http://localhost:3000/authorize?redirect=${encodeURIComponent(req.originalUrl)}`;
    return res.redirect(loginUrl);
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.id;
    next();
  } catch (err) {
    const loginUrl = `http://localhost:3000/authorize?redirect=${encodeURIComponent(req.originalUrl)}`;
    return res.redirect(loginUrl);
  }
};
module.exports = {
    verifyToken,
    isAdmin,
    requireLogin
};