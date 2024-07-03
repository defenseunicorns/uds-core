import { Log } from "pepr";

export function childLog(subproject: string) {
  const childLog = Log.child({ subproject: subproject });

  // Handle commands that do not template the env vars
  let logLevel = process.env.UDS_LOG_LEVEL;
  if (!logLevel || logLevel === "###ZARF_VAR_UDS_LOG_LEVEL###") {
    logLevel = "debug";
  }

  childLog.level = logLevel;

  return childLog;
}
