const User = require("../models/user.model");

// === Get Dashboard Statistics ===
exports.getDashboard = async (req, res) => {
    try {
        const totalUsers = await User.countDocuments();
        const activeUsers = await User.countDocuments({ isActive: true });
        const verifiedUsers = await User.countDocuments({ isVerified: true });
        const pendingVerifications = await User.countDocuments({ 'verification.status': 'pending_review' });
        const mfaEnabledUsers = await User.countDocuments({ 'mfa.enabled': true });

        // Get recent registrations (last 30 days)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const recentRegistrations = await User.countDocuments({ createdAt: { $gte: thirtyDaysAgo } });

        res.status(200).send({
            totalUsers,
            activeUsers,
            verifiedUsers,
            pendingVerifications,
            mfaEnabledUsers,
            recentRegistrations
        });
    } catch (error) {
        res.status(500).send({ message: error.message });
    }
};

// === Get All Users with Filtering ===
exports.getAllUsers = async (req, res) => {
    try {
        const { page = 1, limit = 10, search = '', status = '', verification = '' } = req.query;
        
        let query = {};
        
        // Search by email or full name
        if (search) {
            query.$or = [
                { email: { $regex: search, $options: 'i' } },
                { 'profile.firstName': { $regex: search, $options: 'i' } },
                { 'profile.lastName': { $regex: search, $options: 'i' } }
            ];
        }
        
        // Filter by active status
        if (status) {
            query.isActive = status === 'active';
        }
        
        // Filter by verification status
        if (verification) {
            query['verification.status'] = verification;
        }

        const users = await User.find(query)
            .select('-password -mfa.secret')
            .populate('roles', 'name')
            .sort({ createdAt: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit);

        const total = await User.countDocuments(query);

        res.status(200).send({
            users,
            totalPages: Math.ceil(total / limit),
            currentPage: page,
            total
        });
    } catch (error) {
        res.status(500).send({ message: error.message });
    }
};

// === Get User Details ===
exports.getUserDetails = async (req, res) => {
    try {
        const user = await User.findById(req.params.userId)
            .select('-password -mfa.secret')
            .populate('roles', 'name')
            .populate('verification.reviewedBy', 'email');
            
        if (!user) {
            return res.status(404).send({ message: "Không tìm thấy người dùng." });
        }
        res.status(200).send(user);
    } catch (error) {
        res.status(500).send({ message: error.message });
    }
};

// === Update User Verification Status ===
exports.updateVerificationStatus = async (req, res) => {
    try {
        const { status, notes } = req.body;
        const { userId } = req.params;

        if (!['verified', 'rejected', 'pending_review', 'needs_improvement'].includes(status)) {
            return res.status(400).send({ message: "Trạng thái không hợp lệ." });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).send({ message: "Không tìm thấy người dùng." });
        }

        user.verification.status = status;
        user.isVerified = status === 'verified';
        user.verification.reviewedBy = req.userId;
        user.verification.reviewedAt = new Date();
        user.verification.reviewNotes = notes || '';
        
        await user.save();

        res.status(200).send({ 
            message: `Đã ${status === 'verified' ? 'duyệt' : 'cập nhật'} trạng thái xác minh.`,
            user: user
        });
    } catch (error) {
        res.status(500).send({ message: error.message });
    }
};

// === Toggle User Active Status ===
exports.toggleUserStatus = async (req, res) => {
    try {
        const { userId } = req.params;
        
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).send({ message: "Không tìm thấy người dùng." });
        }

        user.isActive = !user.isActive;
        await user.save();

        res.status(200).send({ 
            message: `Tài khoản đã được ${user.isActive ? 'kích hoạt' : 'khóa'}.`,
            user: user
        });
    } catch (error) {
        res.status(500).send({ message: error.message });
    }
};

// === Update User Role ===
exports.updateUserRole = async (req, res) => {
    try {
        const { userId } = req.params;
        const { roleIds } = req.body; // Array of role IDs

        if (!Array.isArray(roleIds)) {
            return res.status(400).send({ message: "Vai trò phải là một mảng." });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).send({ message: "Không tìm thấy người dùng." });
        }

        user.roles = roleIds;
        await user.save();

        // Populate roles for response
        await user.populate('roles', 'name');

        res.status(200).send({ 
            message: "Đã cập nhật vai trò người dùng.",
            user: user
        });
    } catch (error) {
        res.status(500).send({ message: error.message });
    }
};