const mongoose = require("mongoose");
const crypto = require("crypto");
require("dotenv").config();

// ===== CẤU HÌNH AES =====
const algorithm = "aes-256-cbc";
const ivLength = 16;
const secretKey = process.env.ENCRYPTION_KEY || "12345678901234567890123456789012"; // 32 bytes key

function encrypt(value) {
  if (!value) return value;
  const iv = crypto.randomBytes(ivLength);
  const cipher = crypto.createCipheriv(algorithm, Buffer.from(secretKey), iv);
  let encrypted = cipher.update(value.toString(), "utf8", "hex");
  encrypted += cipher.final("hex");
  return iv.toString("hex") + ":" + encrypted;
}

function decrypt(value) {
  if (!value) return value;
  try {
    const [ivHex, encrypted] = value.split(":");
    const iv = Buffer.from(ivHex, "hex");
    const decipher = crypto.createDecipheriv(algorithm, Buffer.from(secretKey), iv);
    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch (e) {
    return value;
  }
}

// ===== FIELD MÃ HÓA =====
function encryptedField(type = String, options = {}) {
  return {
    type,
    ...options,
    set: encrypt,
    get: decrypt,
  };
}

// ===== SCHEMA =====
const UserSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
  },
  password: encryptedField(String, { required: true }),

  roles: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: "Role"
  }],

  // ===== PROFILE =====
  profile: {
    avatar: { type: String, default: "" }, // không mã hóa
    fullName: encryptedField(),
    firstName: encryptedField(),
    lastName: encryptedField(),
    idNumber: { ...encryptedField(), unique: true, sparse: true },
    phoneNumber: encryptedField(),
    dateOfBirth: encryptedField(Date),
    address: encryptedField(),
    gender: encryptedField()
  },

  // ===== HEALTH =====
  health: {
    height: encryptedField(Number),
    weight: encryptedField(Number),
    bloodType: encryptedField(),
    chronicDiseases: [encryptedField()],
    allergies: [encryptedField()],
    lastUpdated: encryptedField(Date)
  },

  // ===== VERIFICATION =====
  verification: {
    status: encryptedField(String, {
      enum: ['not_started', 'pending_review', 'needs_improvement', 'verified', 'rejected'],
      default: 'not_started'
    }),
    idCard: {
      idNumber: encryptedField(),
      name: encryptedField(),
      dateOfBirth: encryptedField(),
      gender: encryptedField(),
      address: encryptedField(),
      verificationScore: encryptedField(Number),
      validationErrors: [encryptedField()],
      validationWarnings: [encryptedField()],
      completeness: encryptedField(Number),
      verifiedAt: encryptedField(Date),
      rawOcrText: encryptedField()
    },
    documents: {
      frontImagePath: encryptedField(),
      backImagePath: encryptedField()
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    },
    reviewedAt: encryptedField(Date),
    reviewNotes: encryptedField()
  },

  // ===== ACCOUNT STATUS =====
   // Account status
    isActive: {
            type: Boolean,
            default: true
        },
    isVerified: {
            type: Boolean,
            default: false
        },
  // ===== MFA SETTINGS =====
     mfa: {
        enabled: { type: Boolean, default: false },
        emailOTP: String, // Mã OTP tạm thời
        otpExpiresAt: Date, // Thời gian hết hạn OTP
        backupCodes: [String],
        },

}, { timestamps: true });

// ✅ Tự động giải mã khi gọi `.toJSON()` hoặc `.toObject()`
UserSchema.set("toJSON", { getters: true });
UserSchema.set("toObject", { getters: true });

module.exports = mongoose.model("User", UserSchema, "userVNeid-clone");