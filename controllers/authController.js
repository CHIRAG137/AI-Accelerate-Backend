const authService = require("../services/authService");
const logger = require("../utils/logger");
const responseBuilder = require("../utils/responseBuilder");

exports.register = async (req, res) => {
  try {
    const { email, password, name } = req.body;
    const result = await authService.register(email, password, name);

    logger.info("User registered successfully", { email });
    return responseBuilder.created(res, result, "User registered successfully");
  } catch (err) {
    logger.error("User registration failed", { error: err.message });
    return responseBuilder.badRequest(res, null, err.message);
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const result = await authService.login(email, password);

    logger.info("User logged in", { email });
    return responseBuilder.ok(res, result, "Login successful");
  } catch (err) {
    logger.warn("Login failed", { error: err.message, email: req.body.email });
    return responseBuilder.unauthorized(res, null, err.message);
  }
};

exports.googleLogin = async (req, res) => {
  try {
    const googleToken = req.body.token;
    const result = await authService.googleLogin(googleToken);

    logger.info("Google login successful");
    return responseBuilder.ok(res, result, "Google login successful");
  } catch (err) {
    logger.warn("Google login failed", { error: err.message });
    return responseBuilder.unauthorized(res, null, err.message);
  }
};

exports.getUserDetails = async (req, res) => {
  try {
    const userId = req.user._id;
    const result = await authService.getUserDetails(userId);

    if (!result) {
      logger.warn("User not found", { userId });
      return responseBuilder.notFound(res, null, "User not found");
    }

    logger.info("Fetched user details", { userId });
    return responseBuilder.ok(res, result, "User details fetched successfully");
  } catch (err) {
    logger.error("Error fetching user details", { error: err.message });
    return responseBuilder.internalError(res, err.message);
  }
};
