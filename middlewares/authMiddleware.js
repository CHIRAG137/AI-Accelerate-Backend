const jwt = require("jsonwebtoken");
const User = require("../models/User");
const logger = require("../utils/logger");
const responseBuilder = require("../utils/responseBuilder");

exports.authMiddleware = async (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1] || req.query.token;

  if (!token) {
    logger.warn("Authentication failed - no token provided");
    return responseBuilder.unauthorized(res, null, "No token provided");
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);

    if (!user) {
      logger.warn("Authentication failed - user not found", { userId: decoded.id });
      return responseBuilder.unauthorized(res, null, "User not found");
    }

    req.user = user;
    logger.info("Authentication successful", { userId: user._id, email: user.email });
    next();
  } catch (err) {
    logger.error("Authentication failed", { error: err.message });
    return responseBuilder.unauthorized(res, null, "Unauthorized");
  }
};
