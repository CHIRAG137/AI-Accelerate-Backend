function buildResponse(res, statusCode, status, message, result = null) {
  return res.status(statusCode).json({
    status,
    message,
    result,
  });
}

exports.ok = (res, result, message = "OK") =>
  buildResponse(res, 200, "success", message, result);

exports.created = (res, result, message = "Created") =>
  buildResponse(res, 201, "success", message, result);

exports.accepted = (res, result, message = "Accepted") =>
  buildResponse(res, 202, "success", message, result);

exports.noContent = (res, message = "No Content") =>
  buildResponse(res, 204, "success", message, null);

exports.badRequest = (res, error, message = "Bad Request") =>
  buildResponse(res, 400, "error", message, error);

exports.unauthorized = (res, error, message = "Unauthorized") =>
  buildResponse(res, 401, "error", message, error);

exports.forbidden = (res, error, message = "Forbidden") =>
  buildResponse(res, 403, "error", message, error);

exports.notFound = (res, error, message = "Not Found") =>
  buildResponse(res, 404, "error", message, error);

exports.conflict = (res, error, message = "Conflict") =>
  buildResponse(res, 409, "error", message, error);

exports.unprocessableEntity = (res, error, message = "Unprocessable Entity") =>
  buildResponse(res, 422, "error", message, error);

exports.internalError = (res, error, message = "Internal Server Error") =>
  buildResponse(res, 500, "error", message, error);

exports.serviceUnavailable = (res, error, message = "Service Unavailable") =>
  buildResponse(res, 503, "error", message, error);
