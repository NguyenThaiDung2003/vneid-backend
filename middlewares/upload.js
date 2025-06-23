// middlewares/upload.js - Updated upload middleware
const multer = require('multer');
const storage = require('../config/cloudinary.config');
// middlewares/upload.js - Updated upload middleware
const path = require('path');


// File filter
const fileFilter = (req, file, cb) => {
    // Allowed image formats
    const allowedFormats = /jpeg|jpg|png/;
    const extname = allowedFormats.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedFormats.test(file.mimetype);

    if (mimetype && extname) {
        return cb(null, true);
    } else {
        cb(new Error('Only JPEG, JPG and PNG images are allowed'), false);
    }
};

// Multer config
const upload = multer({
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB limit
        files: 2 // Maximum 2 files (front and back)
    },
    fileFilter: fileFilter
});

// Error handling middleware
const handleMulterError = (err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                success: false,
                message: 'File too large. Maximum size is 5MB'
            });
        }
        if (err.code === 'LIMIT_FILE_COUNT') {
            return res.status(400).json({
                success: false,
                message: 'Too many files. Maximum 2 files allowed'
            });
        }
        if (err.code === 'LIMIT_UNEXPECTED_FILE') {
            return res.status(400).json({
                success: false,
                message: 'Unexpected field name. Use "front" and "back" for ID card images'
            });
        }
    }
    if (err.message === 'Only JPEG, JPG and PNG images are allowed') {
        return res.status(400).json({
            success: false,
            message: err.message
        });
    }
    next(err);
};

module.exports = {
    single: upload.single.bind(upload),
    fields: upload.fields.bind(upload),
    handleMulterError
};