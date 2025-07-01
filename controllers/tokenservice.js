// Import thư viện jsonwebtoken để tạo và xác thực JWT
const jwt = require("jsonwebtoken");

/**
 * Tạo access token có thời hạn ngắn (15 phút)
 * Token này sẽ được dùng để xác thực người dùng trong mỗi request
 */
exports.generateAccessToken = (user) => {
    return jwt.sign(
                { 
                    id: user._id, 
                    roles: user.roles.map(role => role.name) 
                }, 
                process.env.JWT_SECRET,
                { expiresIn: '15m' } 
            );
};

/**
 * Tạo refresh token có thời hạn dài hơn (30 ngày)
 * Dùng để lấy access token mới khi access token hết hạn
 */
exports.generateRefreshToken = (user) => {
    return jwt.sign(
        { id: user._id }, // Payload đơn giản hơn, chỉ chứa id người dùng
        process.env.JWT_REFRESH_SECRET, // Secret riêng để ký refresh token
        { expiresIn: '30d' }            // Thời gian sống dài hơn (1 tháng)
    );
};

/**
 * Hàm xác thực refresh token
 * Nếu token hợp lệ -> trả về payload đã giải mã
 * Nếu không hợp lệ (token sai hoặc hết hạn) -> trả về null
 */
exports.validateRefreshToken = (refreshToken) => {
    try {
        return jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    } catch (err) {
        return null; // Token hết hạn hoặc không hợp lệ
    }
};
