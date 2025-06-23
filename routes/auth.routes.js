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

    // === MFA Routes ===
    app.post("/api/auth/mfa/setup", [authJwt.verifyToken], controller.setupMFA);
    app.post("/api/auth/mfa/verify", [authJwt.verifyToken], controller.verifyMFA);
    app.post("/api/auth/mfa/disable", [authJwt.verifyToken], controller.disableMFA);
};