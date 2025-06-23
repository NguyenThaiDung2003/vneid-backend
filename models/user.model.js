const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema({
        email: {
            type: String,
            required: true,
            unique: true
        },
        password: {
            type: String,
            required: true
        },
        roles: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: "Role"
        }],
        
        // Profile information
        profile: {
            firstName: String,
            lastName: String,
            phone: String,
            avatar: String,
            dateOfBirth: Date
        },

        // Verification information
        verification: {
            status: {
                type: String,
                enum: ['not_started', 'pending_review', 'needs_improvement', 'verified', 'rejected'],
                default: 'not_started'
            },
            idCard: {
                idNumber: String,
                name: String,
                dateOfBirth: String,
                gender: String,
                address: String,
                verificationScore: Number,
                validationErrors: [String],
                validationWarnings: [String],
                completeness: Number,
                verifiedAt: Date,
                rawOcrText: String
            },
            documents: {
                frontImagePath: String,
                backImagePath: String
            },
            reviewedBy: {
                type: mongoose.Schema.Types.ObjectId,
                ref: "User"
            },
            reviewedAt: Date,
            reviewNotes: String
        },

        // Account status
        isActive: {
            type: Boolean,
            default: true
        },
        isVerified: {
            type: Boolean,
            default: false
        },

        // MFA settings
        mfa: {
            enabled: {
                type: Boolean,
                default: false
            },
            secret: String,
            backupCodes: [String]
        },

}, { timestamps: true });


module.exports = mongoose.model("User", UserSchema,'userVNeid-clone');