// controllers/verification.controller.js - Fixed for Cloudinary
const IDCardVerification = require('../middlewares/idCardVerification');
const User = require('../models/user.model');
const path = require('path');
const fs = require('fs').promises;
const axios = require('axios'); // Thêm axios để download file từ Cloudinary

const idVerification = new IDCardVerification();

// Upload and verify ID card
exports.uploadAndVerifyIdCard = async (req, res) => {
    try {
        console.log('📁 [Controller] Files received:', {
            hasFiles: !!req.files,
            frontExists: !!(req.files && req.files.front),
            backExists: !!(req.files && req.files.back),
            frontLength: req.files?.front?.length,
            backLength: req.files?.back?.length
        });

        if (!req.files || !req.files.front) {
            return res.status(400).json({
                success: false,
                message: "Ảnh mặt trước là bắt buộc"
            });
        }

        const frontImage = req.files.front[0];
        const backImage = req.files.back ? req.files.back[0] : null;

        console.log('🖼️ [Controller] Front image details:', {
            originalname: frontImage.originalname,
            mimetype: frontImage.mimetype,
            size: frontImage.size,
            hasBuffer: !!frontImage.buffer,
            hasPath: !!frontImage.path,
            fieldname: frontImage.fieldname,
            cloudinaryUrl: frontImage.path // Đây là URL Cloudinary
        });

        // Xử lý file từ Cloudinary
        let processedFrontImage = frontImage;
        let processedBackImage = backImage;

        // Kiểm tra nếu file được upload lên Cloudinary (không có buffer)
        if (!frontImage.buffer && frontImage.path) {
            console.log('☁️ [Controller] Downloading front image from Cloudinary:', frontImage.path);
            try {
                // Download file từ Cloudinary
                const response = await axios.get(frontImage.path, {
                    responseType: 'arraybuffer',
                    timeout: 30000 // 30 giây timeout
                });
                
                const buffer = Buffer.from(response.data);
                processedFrontImage = {
                    ...frontImage,
                    buffer: buffer
                };
                console.log('✅ [Controller] Front image buffer loaded from Cloudinary:', buffer.length, 'bytes');
            } catch (downloadError) {
                console.error('❌ [Controller] Failed to download front image from Cloudinary:', downloadError.message);
                return res.status(400).json({
                    success: false,
                    message: "Không thể tải ảnh mặt trước từ Cloudinary",
                    error: downloadError.message
                });
            }
        }

        // Xử lý tương tự cho ảnh mặt sau
        if (backImage && !backImage.buffer && backImage.path) {
            console.log('☁️ [Controller] Downloading back image from Cloudinary:', backImage.path);
            try {
                const response = await axios.get(backImage.path, {
                    responseType: 'arraybuffer',
                    timeout: 30000 // 30 giây timeout
                });
                
                const buffer = Buffer.from(response.data);
                processedBackImage = {
                    ...backImage,
                    buffer: buffer
                };
                console.log('✅ [Controller] Back image buffer loaded from Cloudinary:', buffer.length, 'bytes');
            } catch (downloadError) {
                console.warn('⚠️ [Controller] Failed to download back image from Cloudinary:', downloadError.message);
                // Tiếp tục mà không có ảnh mặt sau
                processedBackImage = null;
            }
        }

        // Kiểm tra cuối cùng trước khi xác minh
        if (!processedFrontImage.buffer) {
            console.error('❌ [Controller] No buffer available for front image');
            return res.status(400).json({
                success: false,
                message: "Buffer ảnh mặt trước không khả dụng",
                details: "Kiểm tra cấu hình Multer và Cloudinary"
            });
        }

        console.log('🔄 [Controller] Bắt đầu xác minh với ảnh đã xử lý...');

        // Xác minh thẻ căn cước
        const verificationResult = await idVerification.verifyIDCard(
            processedFrontImage,
            processedBackImage
        );

        // Không cần cleanup files vì đã lưu trên Cloudinary

        if (!verificationResult.success) {
            return res.status(400).json({
                success: false,
                message: "Xác minh thẻ căn cước thất bại",
                error: verificationResult.error,
                details: verificationResult.details,
                warnings: verificationResult.warnings
            });
        }

        const { extractedInfo, validation, verificationScore, imageWarnings } = verificationResult.data;

        // Lưu dữ liệu xác minh vào record người dùng
        const userId = req.userId;
        const user = await User.findById(userId);
        
        if (!user) {
            return res.status(404).json({
                success: false,
                message: "Không tìm thấy người dùng"
            });
        }

        // Cập nhật user với dữ liệu xác minh
        user.verification = {
            status: verificationScore >= 70 ? 'pending_review' : 'needs_improvement',
            idCard: {
                idNumber: extractedInfo.idNumber,
                name: extractedInfo.name,
                dateOfBirth: extractedInfo.dateOfBirth,
                gender: extractedInfo.gender,
                address: extractedInfo.address,
                verificationScore,
                validationErrors: validation.errors,
                validationWarnings: validation.warnings,
                completeness: validation.completeness,
                verifiedAt: new Date(),
                rawOcrText: extractedInfo.raw || ''
            },
            documents: {
                frontImagePath: frontImage.path, // Lưu URL Cloudinary thay vì đường dẫn local
                backImagePath: backImage ? backImage.path : null
            }
        };
        user.profile
        await user.save();

        // Xác định bước tiếp theo dựa trên điểm xác minh
        let nextSteps = [];
        if (verificationScore < 70) {
            nextSteps.push("Vui lòng upload ảnh rõ nét hơn");
            if (validation.errors.length > 0) {
                nextSteps.push("Đảm bảo tất cả thông tin cần thiết được hiển thị rõ ràng");
            }
            if (!processedBackImage) {
                nextSteps.push("Vui lòng upload ảnh mặt sau của thẻ căn cước");
            }
        } else {
            nextSteps.push("Xác minh đã được gửi để admin xem xét");
        }

        // Bao gồm cảnh báo chất lượng ảnh nếu có
        if (imageWarnings && imageWarnings.length > 0) {
            nextSteps.push("Vấn đề chất lượng ảnh: " + imageWarnings.join(", "));
        }

        res.status(200).json({
            success: true,
            message: "Xử lý thẻ căn cước thành công",
            data: {
                verificationScore,
                status: user.verification.status,
                extractedInfo: {
                    idNumber: extractedInfo.idNumber ? extractedInfo.idNumber.replace(/(\d{4})(\d{4})(\d{4})/, '$1 $2 $3') : null,
                    name: extractedInfo.name,
                    dateOfBirth: extractedInfo.dateOfBirth,
                    gender: extractedInfo.gender
                },
                completeness: validation.completeness,
                errors: validation.errors,
                warnings: validation.warnings,
                imageWarnings: imageWarnings || [],
                nextSteps
            }
        });

    } catch (error) {
        console.error('❌ [Controller] ID card verification error:', error);
        res.status(500).json({
            success: false,
            message: "Lỗi server nội bộ trong quá trình xác minh",
            error: error.message
        });
    }
};

// Helper function - không cần cleanup files vì sử dụng Cloudinary
exports.cleanupTempFiles = async (files) => {
    // Không cần cleanup khi sử dụng Cloudinary
    console.log('🗑️ [Controller] Cleanup skipped - using Cloudinary storage');
};

// Helper function - không cần save image local vì đã có trên Cloudinary
exports.saveImage = async (file, userId, side) => {
    // Trả về URL Cloudinary thay vì lưu local
    console.log('💾 [Controller] Using Cloudinary URL:', file.path);
    return file.path;
};

// Get verification status
exports.getVerificationStatus = async (req, res) => {
    try {
        const user = await User.findById(req.userId)
            .select('verification isVerified')
            .populate('verification.reviewedBy', 'email');
        
        if (!user || !user.verification) {
            return res.status(200).json({
                success: true,
                data: {
                    status: 'not_started',
                    message: 'Chưa bắt đầu xác minh'
                }
            });
        }

        res.status(200).json({
            success: true,
            data: {
                status: user.verification.status,
                verificationScore: user.verification.idCard?.verificationScore,
                completeness: user.verification.idCard?.completeness,
                errors: user.verification.idCard?.validationErrors,
                warnings: user.verification.idCard?.validationWarnings,
                verifiedAt: user.verification.idCard?.verifiedAt,
                reviewedBy: user.verification.reviewedBy,
                reviewedAt: user.verification.reviewedAt,
                reviewNotes: user.verification.reviewNotes,
                isVerified: user.isVerified
            }
        });

    } catch (error) {
        console.error('Get verification status error:', error);
        res.status(500).json({
            success: false,
            message: "Lỗi khi lấy trạng thái xác minh"
        });
    }
};

// Admin: Review verification
exports.reviewVerification = async (req, res) => {
    try {
        const { userId } = req.params;
        const { action, notes } = req.body; // action: 'approve' | 'reject'

        const user = await User.findById(userId);
        if (!user || !user.verification) {
            return res.status(404).json({
                success: false,
                message: "Không tìm thấy người dùng hoặc thông tin xác minh"
            });
        }

        user.verification.status = action === 'approve' ? 'verified' : 'rejected';
        user.verification.reviewedBy = req.userId;
        user.verification.reviewedAt = new Date();
        user.verification.reviewNotes = notes;

        if (action === 'approve') {
            user.isVerified = true;
        }

        await user.save();

        res.status(200).json({
            success: true,
            message: `Xác minh đã được ${action === 'approve' ? 'phê duyệt' : 'từ chối'} thành công`,
            data: {
                userId,
                status: user.verification.status,
                reviewedAt: user.verification.reviewedAt
            }
        });

    } catch (error) {
        console.error('Review verification error:', error);
        res.status(500).json({
            success: false,
            message: "Lỗi khi xem xét xác minh"
        });
    }
};

// Get all pending verifications (Admin)
exports.getPendingVerifications = async (req, res) => {
    try {
        const { page = 1, limit = 10 } = req.query;

        const users = await User.find({ 
            'verification.status': 'pending_review' 
        })
        .select('-password -mfa.secret')
        .populate('roles', 'name')
        .sort({ 'verification.idCard.verifiedAt': -1 })
        .limit(limit * 1)
        .skip((page - 1) * limit);

        const total = await User.countDocuments({ 
            'verification.status': 'pending_review' 
        });

        res.status(200).json({
            success: true,
            data: {
                users,
                totalPages: Math.ceil(total / limit),
                currentPage: page,
                total
            }
        });

    } catch (error) {
        console.error('Get pending verifications error:', error);
        res.status(500).json({
            success: false,
            message: "Lỗi khi lấy danh sách xác minh chờ duyệt"
        });
    }
};