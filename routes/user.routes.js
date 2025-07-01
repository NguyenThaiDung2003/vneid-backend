// Updated routes/user.routes.js
const authJwt = require("../middlewares/authJwt");
const upload = require("../middlewares/upload");
const controller = require("../controllers/user.controller");
const verificationController = require("../controllers/verification.controller");

module.exports = function(app) {
    app.use(function(req, res, next) {
        res.header(
            "Access-Control-Allow-Headers",
            "x-access-token, Origin, Content-Type, Accept"
        );
        next();
    });

    // === Legacy Test Routes ===
    app.get("/api/test/all", (req, res) => { res.status(200).send("Public Content."); });
    app.get("/api/test/user", [authJwt.verifyToken], (req, res) => { res.status(200).send("User Content."); });
    app.get("/api/test/admin", [authJwt.verifyToken, authJwt.isAdmin], (req, res) => { res.status(200).send("Admin Content."); });

    // === Profile Management Routes ===
    app.get("/api/user/profile", [authJwt.verifyToken], controller.getProfile);
    app.put("/api/user/profile", [authJwt.verifyToken], controller.updateProfile);

    // === Upload Routes ===
    app.post(
        "/api/user/upload/avatar",
        [authJwt.verifyToken, upload.single('avatar')],
        controller.uploadAvatar
    );

    // === Updated KYC/Verification Routes ===
    app.post(
        "/api/user/upload/idcard",
        [
            authJwt.verifyToken, 
            upload.fields([
                { name: 'front', maxCount: 1 }, 
                { name: 'back', maxCount: 1 }
            ])
        ], 
        verificationController.uploadAndVerifyIdCard
    );

    app.get("/api/user/verification/status", [authJwt.verifyToken], verificationController.getVerificationStatus);
    app.post("/api/user/verify", [authJwt.verifyToken], controller.requestVerification);

    // === Admin Verification Review Routes ===
    app.put("/api/admin/verification/:userId/review", 
        [authJwt.verifyToken, authJwt.isAdmin], 
        verificationController.reviewVerification
    );
        // Lấy toàn bộ hồ sơ cá nhân & sức khỏe
    app.get("/api/user/full-profile", [authJwt.verifyToken], controller.getFullProfile);

    // Cập nhật thông tin sức khỏe
    app.put("/api/user/health", [authJwt.verifyToken], controller.updateHealth);
};
