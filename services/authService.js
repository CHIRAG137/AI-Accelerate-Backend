const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const SlackIntegration = require("../models/SlackIntegration");
const { OAuth2Client } = require("google-auth-library");
const logger = require("../utils/logger");

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const createToken = (user) => {
  return jwt.sign({ id: user._id, email: user.email }, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });
};

exports.register = async (email, password, name) => {
  try {
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      logger.warn("Registration attempt with existing email", { email });
      throw new Error("User already exists");
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({ email, password: hashedPassword, name });
    const token = createToken(user);

    logger.info("User registered in service", { userId: user._id, email });
    return { token, user };
  } catch (err) {
    logger.error("Error in register service", { error: err.message, email });
    throw err;
  }
};

exports.login = async (email, password) => {
  try {
    const user = await User.findOne({ email });
    if (!user || !user.password) {
      logger.warn("Login failed - invalid credentials", { email });
      throw new Error("Invalid credentials");
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      logger.warn("Login failed - wrong password", { email });
      throw new Error("Invalid credentials");
    }

    const token = createToken(user);
    logger.info("User logged in successfully", { userId: user._id, email });
    return { token, user };
  } catch (err) {
    logger.error("Error in login service", { error: err.message, email });
    throw err;
  }
};

exports.googleLogin = async (googleToken) => {
  try {
    const ticket = await client.verifyIdToken({ idToken: googleToken, audience: process.env.GOOGLE_CLIENT_ID });

    const payload = ticket.getPayload();
    const { email, name, sub: googleId } = payload;

    let user = await User.findOne({ email });
    if (!user) {
      user = await User.create({ email, name, googleId });
      logger.info("New Google user created", { email, googleId });
    } else {
      logger.info("Google user logged in", { userId: user._id, email });
    }

    const token = createToken(user);
    return { token, user };
  } catch (err) {
    logger.error("Error in Google login service", { error: err.message });
    throw err;
  }
};

exports.getUserDetails = async (userId) => {
  try {
    const user = await User.findById(userId).select("-password");
    if (!user) {
      logger.warn("User not found in getUserDetails", { userId });
      return null;
    }

    const slackIntegration = await SlackIntegration.findOne({ userId });

    logger.info("Fetched user details", { userId, hasSlack: !!slackIntegration });

    return {
      user,
      hasSlackIntegration: !!slackIntegration,
      slackIntegration: slackIntegration
        ? {
            teamId: slackIntegration.slackTeamId,
            teamName: slackIntegration.slackTeamName,
            authedUserId: slackIntegration.slackAuthedUserId,
          }
        : null,
    };
  } catch (err) {
    logger.error("Error in getUserDetails service", { error: err.message, userId });
    throw err;
  }
};
