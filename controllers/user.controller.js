const User = require("../models/user.model");

// Lấy thông tin hồ sơ của người dùng hiện tại
exports.getProfile = async (req, res) => {
    try {
        const user = await User.findById(req.userId)
            .select('-password -mfa.secret')
            .populate('roles', 'name');
            
        if (!user) {
            return res.status(404).send({ message: "Không tìm thấy người dùng." });
        }
        
        res.status(200).send(user);
    } catch (error) {
        res.status(500).send({ message: error.message });
    }
};
// Lấy toàn bộ thông tin hồ sơ & sức khỏe
exports.getFullProfile = async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('-password'); // không gửi mật khẩu
    if (!user) return res.status(404).send({ message: "Không tìm thấy người dùng." });

    res.status(200).send({
      email: user.email,
      roles: user.roles,
      profile: user.profile,
      health: user.health,
      verification: user.verification,
      isActive: user.isActive,
      isVerified: user.isVerified
    });
  } catch (err) {
    res.status(500).send({ message: err.message });
  }
};
exports.updateHealth = async (req, res) => {
  try {
    const { height, weight, bloodType, chronicDiseases, allergies } = req.body;

    const user = await User.findById(req.userId);
    if (!user) return res.status(404).send({ message: "Không tìm thấy người dùng." });

    user.health = {
      height,
      weight,
      bloodType,
      chronicDiseases,
      allergies,
      lastUpdated: new Date()
    };

    await user.save();
    res.status(200).send({ message: "Cập nhật thông tin sức khỏe thành công." });

  } catch (err) {
    res.status(500).send({ message: err.message });
  }
};


// Cập nhật thông tin hồ sơ
exports.updateProfile = async (req, res) => {
    try {
        const {
            firstName,
            lastName,
            phoneNumber,
            idNumber,
            dateOfBirth,
            gender,
            address
        } = req.body;

        const profileData = {
            "profile.firstName": firstName,
            "profile.lastName": lastName,
            "profile.fullName": `${firstName || ''} ${lastName || ''}`.trim(),
            "profile.phoneNumber": phoneNumber,
            "profile.idNumber": idNumber,
            "profile.dateOfBirth": dateOfBirth ? new Date(dateOfBirth) : undefined,
            "profile.gender": gender,
            "profile.address": address
        };

        // Xoá các trường không có giá trị
        Object.keys(profileData).forEach(key => {
            if (profileData[key] === undefined || profileData[key] === null) {
                delete profileData[key];
            }
        });

        const user = await User.findByIdAndUpdate(
            req.userId,
            { $set: profileData },
            { new: true }
        ).select('-password -mfa.secret').populate('roles', 'name');

        if (!user) {
            return res.status(404).json({ message: "Không tìm thấy người dùng." });
        }

        res.status(200).json({
            message: "Hồ sơ đã được cập nhật.",
            user
        });
    } catch (error) {
        console.error("Lỗi updateProfile:", error);
        res.status(500).json({ message: "Lỗi máy chủ. Không thể cập nhật hồ sơ." });
    }
};

// Upload ảnh đại diện
exports.uploadAvatar = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).send({ message: "Vui lòng chọn một file ảnh." });
        }

        const user = await User.findByIdAndUpdate(
            req.userId, 
            { $set: { "profile.avatar": req.file.path } }, 
            { new: true }
        ).select('-password -mfa.secret').populate('roles', 'name');

        if (!user) {
            return res.status(404).send({ message: "Không tìm thấy người dùng." });
        }

        res.status(200).send({ 
            message: "Ảnh đại diện đã được cập nhật.", 
            filePath: req.file.path,
            user: user
        });
    } catch (error) {
        res.status(500).send({ message: error.message });
    }
};

// Upload ảnh CCCD (Updated to match new schema)
exports.uploadIdCard = async (req, res) => {
    try {
        if (!req.files || !req.files.front || !req.files.back) {
            return res.status(400).send({ 
                message: "Vui lòng upload cả ảnh mặt trước và mặt sau." 
            });
        }

        const frontPath = req.files.front[0].path;
        const backPath = req.files.back[0].path;
        
        const user = await User.findByIdAndUpdate(
            req.userId, 
            { 
                $set: { 
                    "verification.documents.frontImagePath": frontPath,
                    "verification.documents.backImagePath": backPath
                }
            }, 
            { new: true }
        ).select('-password -mfa.secret').populate('roles', 'name');

        if (!user) {
            return res.status(404).send({ message: "Không tìm thấy người dùng." });
        }

        res.status(200).send({ 
            message: "Ảnh CCCD đã được tải lên.", 
            user: user
        });
    } catch (error) {
        res.status(500).send({ message: error.message });
    }
};

// Request verification (Updated to match new schema)
exports.requestVerification = async (req, res) => {
    try {
        const user = await User.findById(req.userId);

        if (!user) {
            return res.status(404).send({ message: "Không tìm thấy người dùng." });
        }

        // Check if required information is complete
        const profile = user.profile;
        const verification = user.verification;
        
        if (!profile.firstName || !profile.lastName || !profile.phoneNumber || 
            !profile.dateOfBirth || !verification.documents?.frontImagePath || 
            !verification.documents?.backImagePath) {
            return res.status(400).send({ 
                message: "Vui lòng hoàn thành tất cả thông tin hồ sơ và upload ảnh CCCD trước khi gửi yêu cầu xác minh." 
            });
        }

        if (verification.status === 'pending_review') {
            return res.status(400).send({ message: "Yêu cầu xác minh đang được xử lý." });
        }

        if (verification.status === 'verified') {
            return res.status(400).send({ message: "Tài khoản đã được xác minh." });
        }

        user.verification.status = 'pending_review';
        await user.save();

        res.status(200).send({ 
            message: "Yêu cầu xác minh đã được gửi. Chúng tôi sẽ xem xét trong vòng 24-48 giờ." 
        });
    } catch (error) {
        res.status(500).send({ message: error.message });
    }
};