const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");
const { authMiddleware } = require("../middlewares/authMiddleware");

router.post("/register", authController.register);
router.post("/login", authController.login);
router.post("/google-login", authController.googleLogin);
router.get("/me", authMiddleware, authController.getUserDetails);

module.exports = router;
