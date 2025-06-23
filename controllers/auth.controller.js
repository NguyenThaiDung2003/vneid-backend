const User = require("../models/user.model");
const Role = require("../models/role.model");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const speakeasy = require("speakeasy");
const qrcode = require("qrcode");
const crypto = require("crypto");
require('dotenv').config();

exports.register = async (req, res) => {
    try {
        // Check if user already exists
        const existingUser = await User.findOne({
            $or: [
                { email: req.body.email },
              
            ]
        });

        if (existingUser) {
            return res.status(400).send({ 
                message: "Email hoặc tên đăng nhập đã tồn tại!" 
            });
        }

        // Find default role (assuming you have a 'user' role)
        const userRole = await Role.findOne({ name: "user" });
        
        const user = new User({
          
            email: req.body.email,
            password: bcrypt.hashSync(req.body.password, 8),
            roles: userRole ? [userRole._id] : [],
            profile: {
                firstName: req.body.firstName || '',
                lastName: req.body.lastName || ''
            }
        });

        await user.save();
        
        res.status(201).send({ message: "Người dùng đã được tạo thành công!" });
    } catch (error) {
        res.status(500).send({ message: error.message });
    }
};

exports.login = async (req, res) => {
    try {
        const { email, password, mfaToken } = req.body;

        const user = await User.findOne({ 
            $or: [{ email: email },] // Chỉ lấy theo email
        }).populate('roles', 'name');

        if (!user) {
            return res.status(404).send({ message: "Không tìm thấy người dùng." });
        }

        if (!user.isActive) {
            return res.status(403).send({ message: "Tài khoản đã bị khóa." });
        }

        const passwordIsValid = bcrypt.compareSync(req.body.password, user.password);

        if (!passwordIsValid) {
            return res.status(401).send({
                accessToken: null,
                message: "Mật khẩu không hợp lệ!"
            });
        }

        // === Check if MFA is enabled ===
        if (user.mfa.enabled) {
            if (!req.body.mfaToken) {
                return res.status(200).send({
                    requireMFA: true,
                    message: "Vui lòng nhập mã xác thực 2 lớp."
                });
            }

            // Verify MFA token
            const verified = speakeasy.totp.verify({
                secret: user.mfa.secret,
                encoding: 'base32',
                token: req.body.mfaToken,
                window: 2
            });

            if (!verified) {
                return res.status(401).send({
                    message: "Mã xác thực 2 lớp không hợp lệ!"
                });
            }
        }

        // Update last login (you might want to add this field to your schema)
        user.lastLogin = new Date();
        await user.save();

        const token = jwt.sign(
            { 
                id: user.id, 
                roles: user.roles.map(role => role.name) 
            }, 
            process.env.JWT_SECRET,
            { expiresIn: 86400 } // 24 hours
        );

        res.status(200).send({
            id: user._id,
            email: user.email,
            roles: user.roles.map(role => role.name),
            accessToken: token,
            mfaEnabled: user.mfa.enabled,
            isVerified: user.isVerified
        });
    } catch (error) {
        res.status(500).send({ message: error.message });
    }
};

// === MFA Setup ===
exports.setupMFA = async (req, res) => {
    try {
        const user = await User.findById(req.userId);

        if (!user) {
            return res.status(404).send({ message: "Không tìm thấy người dùng." });
        }

        if (user.mfa.enabled) {
            return res.status(400).send({ message: "MFA đã được kích hoạt." });
        }

        // Generate secret
        const secret = speakeasy.generateSecret({
            name: `VNeID Clone (${user.email})`,
            issuer: 'VNeID Clone'
        });

        // Save temp secret (you might want to add this field to schema)
        user.mfa.tempSecret = secret.base32;
        await user.save();

        // Generate QR Code
        qrcode.toDataURL(secret.otpauth_url, (err, dataUrl) => {
            if (err) {
                return res.status(500).send({ message: "Không thể tạo QR Code" });
            }

            res.status(200).send({
                qrCode: dataUrl,
                secret: secret.base32,
                message: "Quét mã QR bằng ứng dụng Authenticator và nhập mã OTP để kích hoạt."
            });
        });
    } catch (error) {
        res.status(500).send({ message: error.message });
    }
};

// === Verify and Enable MFA ===
exports.verifyMFA = async (req, res) => {
    try {
        const { token } = req.body;

        const user = await User.findById(req.userId);

        if (!user || !user.mfa.tempSecret) {
            return res.status(400).send({ message: "Không tìm thấy thiết lập MFA." });
        }

        const verified = speakeasy.totp.verify({
            secret: user.mfa.tempSecret,
            encoding: 'base32',
            token: token,
            window: 2
        });

        if (!verified) {
            return res.status(401).send({ message: "Mã OTP không hợp lệ!" });
        }

        // Generate backup codes
        const backupCodes = [];
        for (let i = 0; i < 10; i++) {
            backupCodes.push(crypto.randomBytes(4).toString('hex').toUpperCase());
        }

        // Enable MFA
        user.mfa.secret = user.mfa.tempSecret;
        user.mfa.tempSecret = undefined;
        user.mfa.enabled = true;
        user.mfa.backupCodes = backupCodes;
        
        await user.save();

        res.status(200).send({
            message: "MFA đã được kích hoạt thành công!",
            backupCodes: backupCodes
        });
    } catch (error) {
        res.status(500).send({ message: error.message });
    }
};

// === Disable MFA ===
exports.disableMFA = async (req, res) => {
    try {
        const { password, token } = req.body;

        const user = await User.findById(req.userId);

        if (!user) {
            return res.status(404).send({ message: "Không tìm thấy người dùng." });
        }

        // Verify password
        const passwordIsValid = bcrypt.compareSync(password, user.password);
        if (!passwordIsValid) {
            return res.status(401).send({ message: "Mật khẩu không đúng!" });
        }

        // Verify MFA token
        const verified = speakeasy.totp.verify({
            secret: user.mfa.secret,
            encoding: 'base32',
            token: token,
            window: 2
        });

        if (!verified) {
            return res.status(401).send({ message: "Mã OTP không hợp lệ!" });
        }

        // Disable MFA
        user.mfa.secret = undefined;
        user.mfa.tempSecret = undefined;
        user.mfa.enabled = false;
        user.mfa.backupCodes = [];
        
        await user.save();

        res.status(200).send({ message: "MFA đã được vô hiệu hóa." });
    } catch (error) {
        res.status(500).send({ message: error.message });
    }
};