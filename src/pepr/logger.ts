import { Log } from "pepr";

export function setupLogger(component: string) {
  const setupLogger = Log.child({ component: component });

  // Handle commands that do not template the env vars
  let logLevel = process.env.UDS_LOG_LEVEL;
  if (!logLevel || logLevel === "###ZARF_VAR_UDS_LOG_LEVEL###") {
    logLevel = "debug";
  }

  setupLogger.level = logLevel;

  return setupLogger;
}
