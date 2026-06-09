type LogLevel = "info" | "warn" | "error";

type LogMetadata = Record<string, unknown>;

function writeLog(level: LogLevel, message: string, metadata?: LogMetadata) {
  const payload = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...(metadata ? { metadata } : {})
  };

  const line = JSON.stringify(payload);

  if (level === "error") {
    console.error(line);
    return;
  }

  if (level === "warn") {
    console.warn(line);
    return;
  }

  console.log(line);
}

export const logger = {
  info(message: string, metadata?: LogMetadata) {
    writeLog("info", message, metadata);
  },
  warn(message: string, metadata?: LogMetadata) {
    writeLog("warn", message, metadata);
  },
  error(message: string, metadata?: LogMetadata) {
    writeLog("error", message, metadata);
  }
};
