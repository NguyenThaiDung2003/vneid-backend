const authJwt  = require("../middlewares/authJwt");
const controller = require("../controllers/admin.controller");

module.exports = function(app) {
    app.use(function(req, res, next) {
        res.header(
            "Access-Control-Allow-Headers",
            "x-access-token, Origin, Content-Type, Accept"
        );
        next();
    });

    // === Dashboard Routes ===
    app.get("/api/admin/dashboard", [authJwt.verifyToken, authJwt.isAdmin], controller.getDashboard);

    // === User Management Routes ===
    app.get("/api/admin/users", [authJwt.verifyToken, authJwt.isAdmin], controller.getAllUsers);
    app.get("/api/admin/users/:userId", [authJwt.verifyToken, authJwt.isAdmin], controller.getUserDetails);
    
    // === Verification Management ===
    app.put("/api/admin/users/:userId/verification", [authJwt.verifyToken, authJwt.isAdmin], controller.updateVerificationStatus);
    
    // === User Status Management ===
    app.put("/api/admin/users/:userId/status", [authJwt.verifyToken, authJwt.isAdmin], controller.toggleUserStatus);
    app.put("/api/admin/users/:userId/role", [authJwt.verifyToken, authJwt.isAdmin], controller.updateUserRole);
};

