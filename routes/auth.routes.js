const controller = require("../controllers/auth.controller");
const  authJwt = require("../middlewares/authJwt");

module.exports = function(app) {
    app.use(function(req, res, next) {
        res.header(
            "Access-Control-Allow-Headers",
            "x-access-token, Origin, Content-Type, Accept"
        );
        next();
    });

    // === Basic Auth Routes ===
    app.post("/api/auth/register", controller.register);
    app.post("/api/auth/login", controller.login);
    app.post("/api/auth/logout",controller.logoutUser);
    app.post("/api/auth/refresh",controller.refreshUserToken);

    // === MFA Routes ===
    app.post("/api/auth/mfa/setup", [authJwt.verifyToken], controller.setupMFA);
    app.post("/api/auth/mfa/verify", [authJwt.verifyToken], controller.verifyMFA);
    app.post("/api/auth/mfa/disable", [authJwt.verifyToken], controller.disableMFA);
    app.post("/api/auth/mfa/senddisableotp",[authJwt.verifyToken],controller.sendMFAEnableOTP);
    app.get("/api/auth/authorize", [authJwt.requireLogin], controller.authorize);
    app.post("/api/auth/token",controller.exchangeCode);
    app.get("api/auth/me",[authJwt.verifyToken],controller.getMe);
};