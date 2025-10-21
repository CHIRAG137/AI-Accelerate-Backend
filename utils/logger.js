function getTimeStamp() {
  return new Date().toISOString();
}

function formatLog(level, message, meta) {
  return JSON.stringify({
    time: getTimeStamp(),
    level: level.toUpperCase(),
    message,
    ...(meta ? { meta } : {}),
  });
}

function log(level, message, meta) {
  const line = formatLog(level, message, meta);
  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
}

exports.info = (message, meta) => log("info", message, meta);
exports.warn = (message, meta) => log("warn", message, meta);
exports.error = (message, meta) => log("error", message, meta);
exports.debug = (message, meta) => log("debug", message, meta);
