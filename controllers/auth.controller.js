const User = require("../models/user.model");
const Role = require("../models/role.model");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const speakeasy = require("speakeasy");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const NodeCache = require("node-cache");

const {
  generateAccessToken,
  generateRefreshToken,
  validateRefreshToken
} = require("./tokenservice");
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
        const redirect = req.query.redirectUri; // để redirect sau khi login (nếu có)
        const user = await User.findOne({ email }).populate('roles', 'name');

        if (!user) return res.status(404).send({ message: "Không tìm thấy người dùng." });
        if (!user.isActive) return res.status(403).send({ message: "Tài khoản đã bị khóa." });

        const passwordIsValid = bcrypt.compareSync(password, user.password);
        if (!passwordIsValid) {
            return res.status(401).send({ accessToken: null, message: "Mật khẩu không hợp lệ!" });
        }

        // === MFA logic ===
        if (user.mfa.enabled) {
            // Nếu chưa nhập mã OTP thì gửi OTP về email
            if (!mfaToken) {
                const otp = Math.floor(100000 + Math.random() * 900000).toString();
                user.mfa.emailOTP = otp;
                user.mfa.otpExpiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 phút
                await user.save();

                const transporter = nodemailer.createTransport({
                    service: "gmail",
                    auth: {
                        user: process.env.EMAIL_USER,
                        pass: process.env.EMAIL_PASS,
                    },
                });

                await transporter.sendMail({
                    from: `"VNeID Clone" <${process.env.EMAIL_USER}>`,
                    to: user.email,
                    subject: "Mã xác thực đăng nhập",
                    text: `Mã OTP của bạn là: ${otp}. Mã sẽ hết hạn sau 5 phút.`,
                });

                return res.status(200).send({
                    requireMFA: true,
                    message: "Mã xác thực đã được gửi đến email. Vui lòng nhập mã OTP."
                });
            }

            // Nếu đã có mã mfaToken (OTP), tiến hành kiểm tra
            const now = new Date();
            if (
                !user.mfa.emailOTP ||
                !user.mfa.otpExpiresAt ||
                now > user.mfa.otpExpiresAt ||
                mfaToken.trim() !== user.mfa.emailOTP.trim()
            ) {
                return res.status(401).send({ message: "Mã OTP không chính xác hoặc đã hết hạn." });
            }

            // OTP hợp lệ, xóa OTP đã dùng
            user.mfa.emailOTP = undefined;
            user.mfa.otpExpiresAt = undefined;
        }

        // === Đăng nhập thành công ===
        user.lastLogin = new Date();
        await user.save();

        const accessToken = generateAccessToken(user);
        const refreshToken = generateRefreshToken(user);

        res.cookie('refresh_token', refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'Lax',
        });

        if (redirect) {
        return res.redirect(redirect); // Quay lại bước authorize
    }

        res.status(200).send({
            id: user._id,
            email: user.email,
            roles: user.roles.map(role => role.name),
            accessToken: accessToken,
            mfaEnabled: user.mfa.enabled,
            isVerified: user.isVerified
        });

    } catch (error) {
        console.error("Login error:", error);
        res.status(500).send({ message: error.message });
    }
};

exports.logoutUser = (req, res) => {
    try {
        res.clearCookie('refresh_token');
        return res.status(200).json({ message: 'Logged out successfully' });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};
exports.refreshUserToken = async (req, res) => {
    try {
        const refreshToken = req.cookies.refresh_token;
      
        const decoded = validateRefreshToken(refreshToken);
            if (!decoded) throw new Error("Invalid refresh token");

        const user = await User.findById(decoded.id);
            if (!user) throw new Error("User not found");

        const newAccessToken = generateAccessToken(user);
        return res.status(200).send({ accessToken: newAccessToken });
    } catch (error) {
        return res.status(400).send({ message: error.message });
    }
};


// === MFA Setup ===


exports.setupMFA = async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).send({ message: "Không tìm thấy người dùng." });

    if (user.mfa.enabled) {
      return res.status(400).send({ message: "MFA đã được kích hoạt." });
    }

    // Tạo mã OTP ngẫu nhiên 6 số
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Lưu OTP và thời gian hết hạn
    user.mfa.emailOTP = otp;
    user.mfa.otpExpiresAt = new Date(Date.now() + 5 * 60 * 1000); // hết hạn sau 5 phút
    await user.save();

    // Gửi email chứa mã OTP
    const transporter = nodemailer.createTransport({
      service: "gmail", // hoặc smtp khác
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    await transporter.sendMail({
      from: `"VNeID Clone" <${process.env.EMAIL_USER}>`,
      to: user.email,
      subject: "Mã xác thực MFA",
      text: `Mã OTP của bạn là: ${otp}. Mã sẽ hết hạn sau 5 phút.`,
    });

    res.status(200).send({ message: "Đã gửi mã OTP đến email của bạn." });
  } catch (error) {
    res.status(500).send({ message: error.message });
  }
};

// === Verify and Enable MFA ===
exports.verifyMFA = async (req, res) => {
  try {
    const { otp } = req.body;
    const user = await User.findById(req.userId);

    if (!user || !user.mfa.emailOTP) {
      return res.status(400).send({ message: "Không tìm thấy OTP." });
    }

    if (new Date() > user.mfa.otpExpiresAt) {
      return res.status(400).send({ message: "Mã OTP đã hết hạn." });
    }

    if (String(otp).trim() !== String(user.mfa.emailOTP).trim()) {
    return res.status(401).send({ message: "Mã OTP không chính xác." });
    }
    // Generate backup codes
    const backupCodes = [];
    for (let i = 0; i < 10; i++) {
      backupCodes.push(crypto.randomBytes(4).toString("hex").toUpperCase());
    }

    // Enable MFA
    user.mfa.enabled = true;
    user.mfa.backupCodes = backupCodes;
    user.mfa.emailOTP = undefined;
    user.mfa.otpExpiresAt = undefined;

    await user.save();

    res.status(200).send({
      message: "MFA đã được kích hoạt thành công!",
      backupCodes,
    });
  } catch (error) {
    res.status(500).send({ message: error.message });
  }
};

// === Disable MFA ===
exports.sendMFAEnableOTP = async (req, res)=>{
        try {
        const user = await User.findById(req.userId);
        if (!user) return res.status(404).send({ message: "Không tìm thấy người dùng." });

        if (!user.mfa || !user.mfa.enabled) {
            return res.status(400).send({ message: "MFA chưa kích hoạt." });
        }

        const otp = Math.floor(100000 + Math.random() * 900000).toString();

        user.mfa.emailOTP = otp;
        user.mfa.otpExpiresAt = new Date(Date.now() + 5 * 60 * 1000); // hết hạn sau 5 phút
        await user.save();

       const transporter = nodemailer.createTransport({
        service: "gmail", // hoặc smtp khác
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS,
        },
        });

        await transporter.sendMail({
        from: `"VNeID Clone" <${process.env.EMAIL_USER}>`,
        to: user.email,
        subject: "Mã hủy MFA",
        text: `Mã OTP của bạn là: ${otp}. Mã sẽ hết hạn sau 5 phút.`,
        });

        res.status(200).send({ message: "Đã gửi mã OTP đến email của bạn. Vui lòng kiểm tra hộp thư." });
    } catch (error) {
        console.error("Error in sendMFAEnableOTP:", error);
        res.status(500).send({ message: error.message || "Lỗi khi gửi mã OTP." });
    }
};
exports.disableMFA = async (req, res) => {
  try {
    const { password, otp } = req.body;
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).send({ message: "Không tìm thấy người dùng." });

    const passwordIsValid = bcrypt.compareSync(password, user.password);
    if (!passwordIsValid) return res.status(401).send({ message: "Mật khẩu không đúng!" });

    if (!user.mfa.enabled) {
      return res.status(400).send({ message: "MFA chưa được kích hoạt." });
    }

    if (!otp || otp !== user.mfa.emailOTP || new Date() > user.mfa.otpExpiresAt) {
      return res.status(401).send({ message: "Mã OTP không hợp lệ hoặc đã hết hạn." });
    }

    // Disable MFA
    user.mfa.enabled = false;
    user.mfa.backupCodes = [];
    user.mfa.emailOTP = undefined;
    user.mfa.otpExpiresAt = undefined;

    await user.save();

    res.status(200).send({ message: "MFA đã được vô hiệu hóa." });
  } catch (error) {
    res.status(500).send({ message: error.message });
  }
};
exports.authorize = async (req, res) => {
  const { redirectUri } = req.query;
  const user = await User.findById(req.userId);
  if (!user) return res.status(401).send({ message: "Chưa đăng nhập." });

  const code = crypto.randomUUID();
  cache.set(code, user._id.toString(), 300); // Lưu code với TTL 5 phút

  const redirectWithCode = `${redirectUri}?code=${code}`;
  return res.redirect(redirectWithCode);
};
exports.exchangeCode = async (req, res) => {
  const { code } = req.body;
  const userId = cache.get(code);
  if (!userId) return res.status(400).send({ message: "Code không hợp lệ hoặc đã hết hạn." });

  const user = await User.findById(userId);
  if (!user) return res.status(404).send({ message: "Không tìm thấy người dùng." });

  const accessToken = generateAccessToken(user); // JWT
  return res.send({ accessToken });
};
exports.getMe = async (req, res) => {
  const user = await User.findById(req.userId).select("-password");
  if (!user) return res.status(404).send({ message: "Không tìm thấy người dùng." });

  res.send({
    id: user._id,
    email: user.email,
    name: user.profile?.fullName,
    avatar: user.profile?.avatar,
    health: user.health,
  });
};