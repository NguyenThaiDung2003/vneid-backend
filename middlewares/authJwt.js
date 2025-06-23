// --- Middleware để kiểm tra JWT và vai trò ---
const jwt = require("jsonwebtoken");
require('dotenv').config();
const User = require("../models/user.model");

const verifyToken = (req, res, next) => {
    let token = req.headers["x-access-token"];

    if (!token) {
        return res.status(403).send({ message: "Không có token được cung cấp!" });
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        if (err) {
            return res.status(401).send({ message: "Không có quyền truy cập!" });
        }
        req.userId = decoded.id;
        req.userRole = decoded.role;
        next();
    });
};

const isAdmin = (req, res, next) => {
    if (req.userRole === 'admin') {
        next();
        return;
    }
    res.status(403).send({ message: "Yêu cầu vai trò Admin!" });
    return;
};

const authJwt = {
    verifyToken,
    isAdmin
};
module.exports = authJwt;