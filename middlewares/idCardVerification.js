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
    }

    // =========================================================================
    // PHẦN 1: VALIDATE VÀ XỬ LÝ ẢNH (LOGIC ĐÃ CẢI TIẾN)
    // =========================================================================

    async validateImageFile(file) {
        const errors = [];
        const warnings = [];

        if (!file || !file.buffer || file.buffer.length === 0) {
            errors.push('No file provided or file buffer is empty');
            return { isValid: false, errors, warnings };
        }

        if (file.size > this.maxFileSize) {
            errors.push(`File size too large. Maximum ${this.maxFileSize / 1024 / 1024}MB allowed`);
        }

        try {
            const metadata = await sharp(file.buffer).metadata();

            if (!['jpeg', 'png', 'webp'].includes(metadata.format)) {
                errors.push(`Unsupported image format: ${metadata.format}`);
            }

            if (metadata.width < this.minWidth || metadata.height < this.minHeight) {
                errors.push(`Image resolution too low. Minimum ${this.minWidth}x${this.minHeight} required. Current: ${metadata.width}x${metadata.height}`);
            }

            const stats = await sharp(file.buffer).greyscale().stats();
            if (stats.channels[0].stdev < 30) {
                warnings.push('Image may be blurry. Consider providing a clearer image.');
            }
        } catch (error) {
            errors.push(`Image processing failed: ${error.message}. The file might be corrupted.`);
        }

        return {
            isValid: errors.length === 0,
            errors,
            warnings
        };
    }

    async preprocessImage(imageBuffer) {
        try {
            return await sharp(imageBuffer)
                .resize(1600, null, { withoutEnlargement: true, fit: 'inside' })
                .greyscale()
                .normalize()
                .sharpen({ sigma: 1 })
                .png({ quality: 100, compressionLevel: 0 })
                .toBuffer();
        } catch (error) {
            console.error('❌ [preprocessImage] Error:', error.message);
            throw new Error('Image preprocessing failed: ' + error.message);
        }
    }

    async extractTextFromImage(imageBuffer) {
        try {
            const processedImage = await this.preprocessImage(imageBuffer);
            const { data: { text } } = await Tesseract.recognize(
                processedImage,
                'vie',
                { tessedit_pageseg_mode: '3' }
            );
            return text;
        } catch (error) {
            console.error('❌ [extractTextFromImage] OCR Error:', error.message);
            throw new Error('OCR processing failed: ' + error.message);
        }
    }

    // =========================================================================
    // PHẦN 2: PHÂN TÍCH VĂN BẢN (LOGIC ĐÃ CẢI TIẾN)
    // =========================================================================

    parseIDCardInfo(text) {
    console.log('Original text:', text); // Debug log
    console.log('Looking for pattern like: Ô40203018796'); // Debug log
    
    const result = {
        idNumber: null, 
        name: null, 
        dateOfBirth: null, 
        gender: null,
        nationality: 'Việt Nam', 
        placeOfOrigin: null, 
        placeOfResidence: null,
        expiryDate: null, 
        raw: text
    };

    const cleanedText = text.replace(/:/g, ' ').replace(/\n\s*\n/g, '\n').trim();
    const lines = cleanedText.split('\n').map(line => line.trim());

    const fieldPatterns = {
        idNumber: {
            label: /số(\s*\/\s*no\.?)?|cccd|no\.|id|sá/i,
            value: /[^\d]*(\d{12})[^\d]*/ // Cho phép ký tự không phải số ở đầu và cuối
        },
        name: { 
            label: /họ và tên|full name/i, 
            value: /([A-ZÁÀẢÃẠĂẮẰẲẴẶÂẤẦẨẪẬĐÊẾỀỂỄỆÍÌỈĨỊÔỐỒỔỖỘƠỚỜỞỠỢÚÙỦŨỤƯỨỪỬỮỰÝỲỶỸỴĐ]{2,}\s)+[A-ZÁÀẢÃẠĂẮẰẲẴẶÂẤẦẨẪẬĐÊẾỀỂỄỆÍÌỈĨỊÔỐỒỔỖỘƠỚỜỞỠỢÚÙỦŨỤƯỨỪỬỮỰÝỲỶỸỴĐ]{2,}/ 
        },
        dateOfBirth: { 
            label: /ngày sinh|date of birth/i, 
            value: /(\d{2}\/\d{2}\/\d{4})/ 
        },
        gender: { 
            label: /giới tính|sex/i, 
            value: /(Nam|Nữ)/i 
        },
        placeOfOrigin: { 
            label: /quê quán|place of origin/i, 
            value: /[A-ZÁÀẢÃẠĂẮẰẲẴẶÂẤẦẨẪẬĐÊẾỀỂỄỆÍÌỈĨỊÔỐỒỔỖỘƠỚỜỞỠỢÚÙỦŨỤƯỨỪỬỮỰÝỲỶỸỴĐ0-9\s,./-]{10,}/i 
        },
        placeOfResidence: { 
            label: /nơi thường trú|place of residence/i, 
            value: /[A-ZÁÀẢÃẠĂẮẰẲẴẶÂẤẦẨẪẬĐÊẾỀỂỄỆÍÌỈĨỊÔỐỒỔỖỘƠỚỜỞỠỢÚÙỦŨỤƯỨỪỬỮỰÝỲỶỸỴĐ0-9\s,./-]{10,}/i 
        },
        expiryDate: { 
            label: /có giá trị đến|date of expiry/i, 
            value: /(\d{2}\/\d{2}\/\d{4})/ 
        }
    };

    const findValueAfterLabel = (labelRegex, valueRegex, textLines) => {
        for (let i = 0; i < textLines.length; i++) {
            if (labelRegex.test(textLines[i])) {
                const lineRemainder = textLines[i].replace(labelRegex, '');
                let match = lineRemainder.match(valueRegex);
                if (match) return match[0].trim();
                
                for (let j = 1; j <= 2; j++) {
                    if (textLines[i + j]) {
                        match = textLines[i + j].match(valueRegex);
                        if (match) return match[0].trim();
                    }
                }
            }
        }
        return null;
    };

    for (const field in fieldPatterns) {
        const { label, value } = fieldPatterns[field];
        const foundValue = findValueAfterLabel(label, value, lines);
        
        // Xử lý đặc biệt cho idNumber để làm sạch số
        if (field === 'idNumber' && foundValue) {
            const cleanNumber = foundValue.replace(/\D/g, ''); // Loại bỏ tất cả ký tự không phải số
            if (cleanNumber.length === 12) {
                result[field] = cleanNumber;
            } else if (cleanNumber.length > 12) {
                // Nếu có nhiều hơn 12 số, lấy chuỗi 12 số đầu tiên
                result[field] = cleanNumber.substring(0, 12);
            } else {
                result[field] = null; // Không hợp lệ nếu ít hơn 12 số
            }
        } else {
            result[field] = foundValue;
        }
    }

    // --- Fallback để tìm số CCCD 12 chữ số ---
    if (!result.idNumber) {
        console.log('Searching for ID number in fallback methods...'); // Debug
        
        // Phương pháp 1: Tìm số CCCD với ký tự nhiễu (như Ô40203018796)
        const noisyIdPattern = /[^\d]*(\d{12})[^\d]*/g;
        let match;
        const potentialIds = [];
        while ((match = noisyIdPattern.exec(cleanedText)) !== null) {
            potentialIds.push(match[1]);
        }
        
        if (potentialIds.length > 0) {
            result.idNumber = potentialIds[0];
            console.log('Found ID with noisy pattern:', potentialIds[0]); // Debug
        } else {
            // Phương pháp 2: Tìm số CCCD từ dòng chứa "số" hoặc gần label
            const cccdLinePattern = /(?:số.*?|cccd.*?|no.*?|sá.*?)(\d{12})/i;
            const cccdLineMatch = cleanedText.match(cccdLinePattern);
            if (cccdLineMatch) {
                result.idNumber = cccdLineMatch[1];
                console.log('Found ID near label:', cccdLineMatch[1]); // Debug
            } else {
                // Phương pháp 3: Tìm tất cả các chuỗi số liên tiếp
                const allNumbers = cleanedText.match(/\d+/g);
                if (allNumbers) {
                    console.log('All numbers found:', allNumbers); // Debug
                    // Lọc ra những số có đúng 12 chữ số
                    const cccdNumbers = allNumbers.filter(num => num.length === 12);
                    if (cccdNumbers.length > 0) {
                        result.idNumber = cccdNumbers[0];
                        console.log('Found 12-digit number:', cccdNumbers[0]); // Debug
                    }
                }
            }
        }
    }

    // Fallback cho tên
    if (!result.name) {
        const potentialNames = cleanedText.match(/^([A-ZÁÀẢÃẠĂẮẰẲẴẶÂẤẦẨẪẬĐÊẾỀỂỄỆÍÌỈĨỊÔỐỒỔỖỘƠỚỜỞỠỢÚÙỦŨỤƯỨỪỬỮỰÝỲỶỸỴĐ\s]+)$/gm);
        if (potentialNames && potentialNames.length > 0) {
            potentialNames.sort((a, b) => b.length - a.length);
            if (potentialNames[0].trim().split(' ').length >= 2) {
                result.name = potentialNames[0].trim();
            }
        }
    }

    // Xử lý địa chỉ
    if (result.placeOfResidence && !result.placeOfOrigin) {
        result.placeOfOrigin = result.placeOfResidence;
    }

    if (!result.placeOfResidence && result.placeOfOrigin) {
        result.placeOfResidence = result.placeOfOrigin;
    }

    return result;
}
    // =========================================================================
    // PHẦN 3: LOGIC CHÍNH VÀ CÁC HÀM PHỤ TRỢ (GIỮ NGUYÊN TỪ CODE GỐC)
    // =========================================================================

    validateExtractedInfo(info) {
        const errors = [];
        const warnings = [];

        if (!info.idNumber) errors.push('ID number not found or invalid');
        if (!info.name) warnings.push('Name not clearly detected');
        if (!info.dateOfBirth) warnings.push('Date of birth not found');
        if (!info.gender) warnings.push('Gender not detected');

        if (info.dateOfBirth) {
            const [day, month, year] = info.dateOfBirth.split('/').map(Number);
            const birthDate = new Date(year, month - 1, day);
            const currentDate = new Date();
            if (birthDate > currentDate) {
                errors.push('Invalid date of birth (future date)');
            }
        }

        return {
            isValid: errors.length === 0,
            errors,
            warnings,
            completeness: this.calculateCompleteness(info)
        };
    }

    calculateCompleteness(info) {
        const fields = ['idNumber', 'name', 'dateOfBirth', 'gender', 'placeOfResidence'];
        const filledFields = fields.filter(field => info[field]);
        return Math.round((filledFields.length / fields.length) * 100);
    }
    
    validateBackSide(backText) {
        const requiredElements = ['công an', 'police', 'cục trưởng', 'director', 'có giá trị', 'valid', 'đến', 'until', 'đặc điểm', 'cảnh sát', 'ngày', 'tháng', 'năm'];
        const lowerText = backText.toLowerCase();
        const foundElements = requiredElements.filter(element => lowerText.includes(element.toLowerCase()));
        return foundElements.length >= 2;
    }

    calculateVerificationScore(extractedInfo, validation, backInfo) {
        let score = 0;
        score += validation.completeness * 0.6;
        if (extractedInfo.idNumber) score += 20;
        if (extractedInfo.name) score += 10;
        if (extractedInfo.dateOfBirth) score += 5;
        score -= validation.errors.length * 10;
        if (backInfo && backInfo.hasRequiredElements) {
            score += 15;
        }
        return Math.max(0, Math.min(100, Math.round(score)));
    }

    /**
     * ✅ [ĐÃ HOÀN TÁC] Hàm chính điều phối, trả về dữ liệu theo đúng cấu trúc ban đầu.
     */
    async verifyIDCard(frontFile, backFile = null) {
        try {
            console.log('✅ [1] Bắt đầu xác minh ID Card...');

            const frontValidation = await this.validateImageFile(frontFile);
            if (frontValidation.warnings.length > 0) {
                console.warn('⚠️ [2] Image warnings:', frontValidation.warnings);
            }
            if (!frontValidation.isValid) {
                return {
                    success: false,
                    error: 'Front image validation failed',
                    details: frontValidation.errors,
                    warnings: frontValidation.warnings
                };
            }
            console.log('✅ [2] Ảnh hợp lệ.');

            console.log('⏳ [3] Đang trích xuất thông tin từ hình ảnh...');
            const frontText = await this.extractTextFromImage(frontFile.buffer);
            console.log('✅ [3] OCR hoàn tất.');

            console.log('⏳ [4] Phân tích thông tin ID card...');
            const extractedInfo = this.parseIDCardInfo(frontText);
            console.log('✅ [4] Thông tin trích xuất:', extractedInfo);

            console.log('⏳ [5] Đánh giá thông tin...');
            const validation = this.validateExtractedInfo(extractedInfo);
            console.log('✅ [5] Kết quả đánh giá:', validation);

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
            console.error('❌ [Error] Lỗi trong verifyIDCard:', error.stack);
            return {
                success: false,
                error: 'Verification process failed',
                details: error.message
            };
        }
    }
}

module.exports = IDCardVerification;