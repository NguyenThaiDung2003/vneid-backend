// middlewares/idCardVerification.js
const sharp = require('sharp');
const Tesseract = require('tesseract.js');
const fs = require('fs').promises;
const path = require('path');

class IDCardVerification {
    constructor() {
        this.allowedFormats = ['jpg', 'jpeg', 'png', 'webp'];
        this.maxFileSize = 5 * 1024 * 1024; // 5MB
        this.minWidth = 400;
        this.minHeight = 250;
        
        // Regex patterns for Vietnamese ID card
        this.patterns = {
            // Old format: 9 or 12 digits
            oldIdNumber: /^(\d{9}|\d{12})$/,
            // New format: 12 digits
            newIdNumber: /^\d{12}$/,
            // Name pattern (Vietnamese characters)
            name: /^[A-ZÁÀẢÃẠĂẮẰẲẴẶÂẤẦẨẪẬÉÈẺẼẸÊẾỀỂỄỆÍÌỈĨỊÓÒỎÕỌÔỐỒỔỖỘƠỚỜỞỠỢÚÙỦŨỤƯỨỪỬỮỰÝỲỶỸỴĐ\s]+$/i,
            // Date format: DD/MM/YYYY
            dateOfBirth: /^(0[1-9]|[12][0-9]|3[01])\/(0[1-9]|1[012])\/\d{4}$/,
            // Gender in Vietnamese
            gender: /^(Nam|Nữ)$/,
            // Vietnamese address pattern
            address: /^[A-ZÁÀẢÃẠĂẮẰẲẴẶÂẤẦẨẪẬÉÈẺẼẸÊẾỀỂỄỆÍÌỈĨỊÓÒỎÕỌÔỐỒỔỖỘƠỚỜỞỠỢÚÙỦŨỤƯỨỪỬỮỰÝỲỶỸỴĐ0-9\s,.-]+$/i
        };

        // Keywords to identify card fields
        this.fieldKeywords = {
            idNumber: ['số', 'no', 'cccd', 'cmnd'],
            name: ['họ', 'tên', 'name'],
            dateOfBirth: ['sinh', 'ngày', 'date', 'birth'],
            gender: ['giới', 'tính', 'sex', 'gender'],
            address: ['thường', 'trú', 'address', 'quê', 'quán']
        };
    }

    // Enhanced image validation with better error handling
    async validateImageFile(file) {
        const errors = [];
        const warnings = [];

        console.log('🔍 [validateImageFile] Checking file:', {
            hasFile: !!file,
            originalname: file?.originalname,
            mimetype: file?.mimetype,
            size: file?.size,
            hasBuffer: !!file?.buffer,
            bufferLength: file?.buffer?.length
        });

        // Check file existence
        if (!file) {
            errors.push('No file provided');
            return { isValid: false, errors, warnings };
        }

        // Check if buffer exists and has content
        if (!file.buffer || file.buffer.length === 0) {
            errors.push('File buffer is empty or corrupted');
            return { isValid: false, errors, warnings };
        }

        // Check file size
        if (file.size > this.maxFileSize) {
            errors.push(`File size too large. Maximum ${this.maxFileSize / 1024 / 1024}MB allowed`);
        }

        // Check MIME type first (more reliable than file extension)
        const allowedMimeTypes = [
            'image/jpeg', 'image/jpg', 'image/png', 'image/webp'
        ];
        
        if (file.mimetype && !allowedMimeTypes.includes(file.mimetype.toLowerCase())) {
            errors.push(`Invalid MIME type: ${file.mimetype}. Allowed types: ${allowedMimeTypes.join(', ')}`);
        }

        // Check file extension as secondary validation
        if (file.originalname) {
            const fileExtension = path.extname(file.originalname).toLowerCase().slice(1);
            if (!this.allowedFormats.includes(fileExtension)) {
                warnings.push(`File extension "${fileExtension}" doesn't match allowed formats: ${this.allowedFormats.join(', ')}`);
            }
        }

        // Enhanced image validation with Sharp
        try {
            console.log('🔍 [validateImageFile] Processing with Sharp...');
            
            // First, try to get basic metadata
            const metadata = await sharp(file.buffer).metadata();
            console.log('✅ [validateImageFile] Sharp metadata:', {
                format: metadata.format,
                width: metadata.width,
                height: metadata.height,
                channels: metadata.channels,
                density: metadata.density
            });
            
            // Validate dimensions
            if (metadata.width < this.minWidth || metadata.height < this.minHeight) {
                errors.push(`Image resolution too low. Minimum ${this.minWidth}x${this.minHeight} required. Current: ${metadata.width}x${metadata.height}`);
            }

            // Check if image format is supported
            if (!['jpeg', 'png', 'webp'].includes(metadata.format)) {
                errors.push(`Unsupported image format: ${metadata.format}`);
            }

            // Try to process the image to ensure it's not corrupted
            try {
                await sharp(file.buffer)
                    .resize(100, 100) // Small resize test
                    .jpeg()
                    .toBuffer();
                console.log('✅ [validateImageFile] Image processing test passed');
            } catch (processError) {
                console.error('❌ [validateImageFile] Image processing test failed:', processError.message);
                errors.push('Image is corrupted or cannot be processed');
            }

            // Enhanced blur detection
            try {
                const stats = await sharp(file.buffer)
                    .greyscale()
                    .stats();
                
                console.log('📊 [validateImageFile] Image stats:', {
                    mean: stats.channels[0].mean,
                    stdev: stats.channels[0].stdev,
                    min: stats.channels[0].min,
                    max: stats.channels[0].max
                });
                
                // Enhanced blur detection with multiple criteria
                if (stats.channels[0].stdev < 30) {
                    warnings.push('Image may be blurry. Consider providing a clearer image for better results');
                }
                
                // Check for very dark or very bright images
                if (stats.channels[0].mean < 30) {
                    warnings.push('Image appears very dark. Consider improving lighting');
                } else if (stats.channels[0].mean > 220) {
                    warnings.push('Image appears overexposed. Consider reducing brightness');
                }

            } catch (statsError) {
                console.warn('⚠️ [validateImageFile] Could not analyze image statistics:', statsError.message);
                warnings.push('Could not analyze image quality');
            }

        } catch (error) {
            console.error('❌ [validateImageFile] Sharp processing error:', {
                message: error.message,
                stack: error.stack,
                bufferLength: file.buffer?.length,
                firstBytes: file.buffer?.slice(0, 10)?.toString('hex')
            });
            
            // More specific error messages based on Sharp errors
            if (error.message.includes('Input buffer contains unsupported image format')) {
                errors.push('Unsupported or corrupted image format. Please use JPEG, PNG, or WebP');
            } else if (error.message.includes('Input buffer is empty')) {
                errors.push('Image file is empty or corrupted');
            } else if (error.message.includes('VipsJpeg')) {
                errors.push('Corrupted JPEG file. Please try a different image or re-save the file');
            } else if (error.message.includes('VipsPng')) {
                errors.push('Corrupted PNG file. Please try a different image or re-save the file');
            } else {
                errors.push(`Image processing failed: ${error.message}`);
            }
        }

        return {
            isValid: errors.length === 0,
            errors,
            warnings
        };
    }

    // Enhanced preprocessing with error handling
    async preprocessImage(imageBuffer) {
        try {
            console.log('🔄 [preprocessImage] Starting image preprocessing...');
            
            // First, validate the buffer
            if (!imageBuffer || imageBuffer.length === 0) {
                throw new Error('Empty image buffer provided');
            }

            // Get original metadata
            const originalMetadata = await sharp(imageBuffer).metadata();
            console.log('📋 [preprocessImage] Original image:', {
                format: originalMetadata.format,
                width: originalMetadata.width,
                height: originalMetadata.height
            });

            // Enhanced preprocessing pipeline
            const processedBuffer = await sharp(imageBuffer)
                .resize(1200, null, { 
                    withoutEnlargement: true,
                    fit: 'inside'
                })
                .sharpen(1, 1, 2) // More controlled sharpening
                .normalize()
                .greyscale()
                .gamma(1.2) // Slight gamma correction
                .linear(1.2, -(128 * 0.2)) // Contrast enhancement
                .threshold(128)
                .png({ quality: 100 })
                .toBuffer();

            console.log('✅ [preprocessImage] Preprocessing completed');
            return processedBuffer;
            
        } catch (error) {
            console.error('❌ [preprocessImage] Error:', error.message);
            throw new Error('Image preprocessing failed: ' + error.message);
        }
    }

    // Rest of the methods remain the same...
    async extractTextFromImage(imageBuffer) {
        try {
            console.log('🔤 [extractTextFromImage] Starting OCR...');
            const processedImage = await this.preprocessImage(imageBuffer);
            
            const { data: { text } } = await Tesseract.recognize(
                processedImage,
                'vie', // Vietnamese language
                {
                    logger: m => {
                        if (m.status === 'recognizing text') {
                            console.log(`📖 OCR Progress: ${Math.round(m.progress * 100)}%`);
                        }
                    },
                    tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789áàảãạăắằẳẵặâấầẩẫậéèẻẽẹêếềểễệíìỉĩịóòỏõọôốồổỗộơớờởỡợúùủũụưứừửữựýỳỷỹỵđÁÀẢÃẠĂẮẰẲẴẶÂẤẦẨẪẬÉÈẺẼẸÊẾỀỂỄỆÍÌỈĨỊÓÒỎÕỌÔỐỒỔỖỘƠỚỜỞỠỢÚÙỦŨỤƯỨỪỬỮỰÝỲỶỸỴĐ /.-,',
                    tessedit_pageseg_mode: '6'
                }
            );

            console.log('✅ [extractTextFromImage] OCR completed');
            return text;
        } catch (error) {
            console.error('❌ [extractTextFromImage] OCR Error:', error.message);
            throw new Error('OCR processing failed: ' + error.message);
        }
    }

    // Parse extracted text to identify ID card information
    parseIDCardInfo(text) {
        const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
        const result = {
            idNumber: null,
            name: null,
            dateOfBirth: null,
            gender: null,
            address: null,
            raw: text
        };

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const nextLine = lines[i + 1] || '';

            // Extract ID number
            if (!result.idNumber) {
                const idMatch = line.match(/(\d{9}|\d{12})/);
                if (idMatch && this.isValidIDNumber(idMatch[1])) {
                    result.idNumber = idMatch[1];
                }
            }

            // Extract name (usually after "Họ và tên" or similar keywords)
            if (!result.name && this.containsKeywords(line, this.fieldKeywords.name)) {
                const nameCandidate = nextLine || line.split(':')[1]?.trim();
                if (nameCandidate && this.patterns.name.test(nameCandidate)) {
                    result.name = nameCandidate.toUpperCase();
                }
            }

            // Extract date of birth
            if (!result.dateOfBirth) {
                const dateMatch = line.match(/(\d{2}\/\d{2}\/\d{4})/);
                if (dateMatch && this.patterns.dateOfBirth.test(dateMatch[1])) {
                    result.dateOfBirth = dateMatch[1];
                }
            }

            // Extract gender
            if (!result.gender) {
                const genderMatch = line.match(/(Nam|Nữ)/);
                if (genderMatch) {
                    result.gender = genderMatch[1];
                }
            }

            // Extract address (usually longest line or after address keywords)
            if (!result.address && this.containsKeywords(line, this.fieldKeywords.address)) {
                const addressCandidate = nextLine || line.split(':')[1]?.trim();
                if (addressCandidate && addressCandidate.length > 10) {
                    result.address = addressCandidate;
                }
            }
        }

        return result;
    }

    // Check if text contains specific keywords
    containsKeywords(text, keywords) {
        const lowerText = text.toLowerCase();
        return keywords.some(keyword => lowerText.includes(keyword.toLowerCase()));
    }

    // Validate extracted ID number
    isValidIDNumber(idNumber) {
        return this.patterns.newIdNumber.test(idNumber);
    }

    // Validate extracted information
    validateExtractedInfo(info) {
        const errors = [];
        const warnings = [];

        // Check required fields
        if (!info.idNumber) {
            errors.push('ID number not found or invalid');
        }

        if (!info.name) {
            warnings.push('Name not clearly detected');
        }

        if (!info.dateOfBirth) {
            warnings.push('Date of birth not found');
        } else {
            // Validate date format and logic
            const [day, month, year] = info.dateOfBirth.split('/').map(Number);
            const birthDate = new Date(year, month - 1, day);
            const currentDate = new Date();
            
            if (birthDate > currentDate) {
                errors.push('Invalid date of birth (future date)');
            }
            
            const age = currentDate.getFullYear() - year;
            if (age < 15 || age > 100) {
                warnings.push('Unusual age detected, please verify');
            }
        }

        if (!info.gender) {
            warnings.push('Gender not detected');
        }

        return {
            isValid: errors.length === 0,
            errors,
            warnings,
            completeness: this.calculateCompleteness(info)
        };
    }

    // Calculate information completeness percentage
    calculateCompleteness(info) {
        const fields = ['idNumber', 'name', 'dateOfBirth', 'gender', 'address'];
        const filledFields = fields.filter(field => info[field] && info[field].length > 0);
        return Math.round((filledFields.length / fields.length) * 100);
    }

    // Main verification function
    async verifyIDCard(frontFile, backFile = null) {
        try {
            console.log('✅ [1] Bắt đầu xác minh ID Card...');

            // Validate front image
            console.log('⏳ [2] Đang kiểm tra file ảnh...');
            const frontValidation = await this.validateImageFile(frontFile);
            
            // Log warnings even if validation passes
            if (frontValidation.warnings.length > 0) {
                console.warn('⚠️ [2] Image warnings:', frontValidation.warnings);
            }
            
            if (!frontValidation.isValid) {
                console.error('❌ [Error] Ảnh không hợp lệ:', frontValidation.errors);
                return { 
                    success: false, 
                    error: 'Front image validation failed', 
                    details: frontValidation.errors,
                    warnings: frontValidation.warnings
                };
            }
            console.log('✅ [2] Ảnh hợp lệ');

            // OCR
            console.log('⏳ [3] Đang trích xuất thông tin từ hình ảnh...');
            const frontText = await this.extractTextFromImage(frontFile.buffer);
            console.log('✅ [3] OCR hoàn tất, văn bản:', frontText.slice(0, 200) + '...');

            // Parse thông tin
            console.log('⏳ [4] Phân tích thông tin ID card...');
            const extractedInfo = this.parseIDCardInfo(frontText);
            console.log('✅ [4] Thông tin trích xuất:', extractedInfo);

            // Validate thông tin
            console.log('⏳ [5] Đánh giá thông tin...');
            const validation = this.validateExtractedInfo(extractedInfo);
            console.log('✅ [5] Kết quả đánh giá:', validation);

            // Back image
            let backInfo = null;
            if (backFile) {
                console.log('⏳ [6] Xử lý mặt sau ID card...');
                const backValidation = await this.validateImageFile(backFile);
                if (backValidation.isValid) {
                    const backText = await this.extractTextFromImage(backFile.buffer);
                    backInfo = {
                        text: backText,
                        hasRequiredElements: this.validateBackSide(backText),
                    };
                    console.log('✅ [6] Thông tin mặt sau:', backInfo);
                } else {
                    console.warn('⚠️ Mặt sau không hợp lệ:', backValidation.errors);
                }
            }

            // Tổng hợp
            const score = this.calculateVerificationScore(extractedInfo, validation, backInfo);
            console.log('🏁 Hoàn tất xác minh. Điểm số:', score);

            return {
                success: true,
                data: { 
                    extractedInfo, 
                    validation, 
                    backInfo, 
                    verificationScore: score,
                    imageWarnings: frontValidation.warnings
                }
            };
        } catch (error) {
            console.error('❌ [Error] Lỗi trong verifyIDCard:', error.message, error.stack);
            return { 
                success: false, 
                error: 'Verification process failed', 
                details: error.message 
            };
        }
    }

    // Validate back side of ID card
    validateBackSide(backText) {
        const requiredElements = [
            'công an', 'police', 'cục trưởng', 'director',
            'có giá trị', 'valid', 'đến', 'until'
        ];
        
        const lowerText = backText.toLowerCase();
        const foundElements = requiredElements.filter(element => 
            lowerText.includes(element.toLowerCase())
        );
        
        return foundElements.length >= 2;
    }

    // Calculate overall verification score
    calculateVerificationScore(extractedInfo, validation, backInfo) {
        let score = 0;

        // Base score from extracted information completeness
        score += validation.completeness * 0.6;

        // Bonus for having required fields
        if (extractedInfo.idNumber) score += 20;
        if (extractedInfo.name) score += 10;
        if (extractedInfo.dateOfBirth) score += 5;

        // Penalty for errors
        score -= validation.errors.length * 10;

        // Bonus for back side verification
        if (backInfo && backInfo.hasRequiredElements) {
            score += 15;
        }

        return Math.max(0, Math.min(100, Math.round(score)));
    }
}

module.exports = IDCardVerification;