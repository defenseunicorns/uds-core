import { Log } from "pepr";

export function childLog(subproject: string) {
  const childLog = Log.child({ subproject: subproject });

  // We need to handle `npx pepr <>` commands that will not template the env vars
  let logLevel = process.env.UDS_LOG_LEVEL;
  if (!logLevel || logLevel === "###ZARF_VAR_LOG_LEVEL###") {
    logLevel = "debug";
  }
  childLog.level = logLevel;

  return childLog;
}
