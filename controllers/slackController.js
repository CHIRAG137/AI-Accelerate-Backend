const slackService = require("../services/slackService");
const logger = require("../utils/logger");
const responseBuilder = require("../utils/responseBuilder");

exports.initiateSlackOAuth = (req, res) => {
  if (!req.user) {
    logger.warn("Unauthorized Slack OAuth initiation attempt");
    return responseBuilder.unauthorized(res, null, "Unauthorized");
  }

  try {
    const slackAuthUrl = slackService.getSlackOAuthUrl(req.user._id);
    logger.info("Slack OAuth initiation successful", { userId: req.user._id });
    return res.redirect(slackAuthUrl);
  } catch (error) {
    logger.error("Slack OAuth initiation error", { error: error.message, userId: req.user?._id });
    return responseBuilder.internalError(res, null, "Failed to initiate Slack OAuth");
  }
};

exports.handleSlackOAuthCallback = async (req, res) => {
  const { code, state } = req.query;

  if (!code || !state) {
    logger.warn("Slack OAuth callback missing parameters", { code, state });
    return responseBuilder.badRequest(res, null, "Missing code or state");
  }

  try {
    await slackService.processSlackOAuthCallback(code, state);
    logger.info("Slack OAuth callback processed successfully", { state });
    return responseBuilder.ok(res, null, "Slack app successfully installed for your account!");
  } catch (error) {
    logger.error("Slack OAuth callback error", { error: error.message, state });
    return responseBuilder.internalError(res, null, "Internal Server Error");
  }
};

exports.handleCommand = async (req, res) => {
  try {
    logger.info("Received Slack command/event", { body: req.body });

    const response = await slackService.handleSlackEvent(req.body);

    if (response?.challenge) {
      logger.info("Responding to Slack URL verification challenge");
      return res.send({ challenge: response.challenge }); // URL verification
    }

    logger.info("Slack command handled successfully");
    return responseBuilder.ok(res, null, "Slack command handled");
  } catch (error) {
    logger.error("Slack command error", { error: error.message, body: req.body });
    return responseBuilder.internalError(res, null, "Internal Server Error");
  }
};
