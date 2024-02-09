import { UDSPackage } from ".";

/**
 * Migrates the package to the latest version
 *
 * @param pkg the package to migrate
 * @returns
 */
export function migrate(pkg: UDSPackage) {
  const exposeList = pkg.spec?.network?.expose ?? [];

  for (const expose of exposeList) {
    // Migrate expose[].match -> expose[].advancedHTTP.match
    if (expose.match) {
      expose.advancedHTTP = expose.advancedHTTP ?? {};
      expose.advancedHTTP.match = expose.match;
      delete expose.match;
    }
  }

  const allowList = pkg.spec?.network?.allow ?? [];

  for (const allow of allowList) {
    // Migrate allow[].podLabels -> allow[].selector
    if (allow.podLabels) {
      allow.selector = allow.podLabels;
      delete allow.podLabels;
    }

    // Migrate allow[].remotePodLabels -> allow[].remoteSelector
    if (allow.remotePodLabels) {
      allow.remoteSelector = allow.remotePodLabels;
      delete allow.remotePodLabels;
    }
  }

  return pkg;
}
