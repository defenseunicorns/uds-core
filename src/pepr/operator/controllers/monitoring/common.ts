import { Monitor } from "../../crd";
import { sanitizeResourceName } from "../utils";

export function generateMonitorName(pkgName: string, monitor: Monitor) {
  const { selector, portName, description } = monitor;

  // Ensure the resource name is valid
  const nameSuffix = description || `${Object.values(selector)}-${portName}`;
  const name = sanitizeResourceName(`${pkgName}-${nameSuffix}`);

  return name;
}
