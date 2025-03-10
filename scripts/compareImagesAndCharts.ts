#!/usr/bin/env ts-node
/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

/**
 * compareImagesAndCharts.ts
 *
 * Strictly follows the design doc to compare old vs. new charts and images.
 * Outputs a CSV list of labels for `gh pr edit`.
 *
 * Usage:
 *   npx ts-node compareImagesAndCharts.ts --old old/extract --new new/extract
 */

import * as fs from "fs";
import * as path from "path";
import * as process from "process";
import * as semver from "semver";
import { parse as parseYaml } from "yaml";

function loadYamlFile(filePath: string): Record<string, any> {
  if (!fs.existsSync(filePath)) return {};
  return parseYaml(fs.readFileSync(filePath, "utf-8"));
}

function buildVersionMap(images: Record<string, string[]>): Record<string, Set<string>> {
  const versionMap: Record<string, Set<string>> = {};
  for (const imgName in images) {
    images[imgName].forEach(tag => {
      const parsedVersion = semver.coerce(tag); // Loose parsing of semver
      if (!parsedVersion) return; // Skip invalid versions
      const tagStr = parsedVersion.version;

      if (!versionMap[tagStr]) {
        versionMap[tagStr] = new Set();
      }
      versionMap[tagStr].add(imgName);
    });
  }
  return versionMap;
}

async function main() {
  const args = process.argv.slice(2);
  let oldPath = "";
  let newPath = "";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--old") {
      oldPath = args[i + 1];
    } else if (args[i] === "--new") {
      newPath = args[i + 1];
    }
  }

  // Load YAML data
  const oldCharts = loadYamlFile(path.join(oldPath, "charts.yaml"));
  const oldImages = loadYamlFile(path.join(oldPath, "images.yaml"));
  const newCharts = loadYamlFile(path.join(newPath, "charts.yaml"));
  const newImages = loadYamlFile(path.join(newPath, "images.yaml"));

  const labels = new Set<string>();
  const debugInfo: string[] = [];

  let hasHelmUpdates = false;
  let hasImageUpdates = false;

  // 🔍 **Chart Version Comparisons**
  for (const chartRef of Object.keys(oldCharts)) {
    const oldVer = oldCharts[chartRef];
    const newVer = newCharts[chartRef];

    if (!newVer || newVer === oldVer) continue;

    debugInfo.push(`Chart version bump: ${chartRef} from ${oldVer} to ${newVer}`);
    hasHelmUpdates = true;

    // Use `semver.diff` to check for a **major** bump
    if (semver.valid(oldVer) && semver.valid(newVer) && semver.diff(oldVer, newVer) === "major") {
      labels.add("major-helm-update");
    }
  }

  // 🔍 **Image Version Comparisons**
  const oldVersionMap = buildVersionMap(oldImages);
  const newVersionMap = buildVersionMap(newImages);

  const allOldVersions = Object.keys(oldVersionMap).sort(semver.compare);
  const allNewVersions = Object.keys(newVersionMap).sort(semver.compare);

  for (const newVersion of allNewVersions) {
    let matched = false;

    for (const oldVersion of allOldVersions) {
      if (newVersion === oldVersion) {
        matched = true;
        break;
      }

      if (oldVersionMap[oldVersion] && newVersionMap[newVersion]) {
        const oldSet = oldVersionMap[oldVersion];
        const newSet = newVersionMap[newVersion];

        if ([...newSet].every(img => oldSet.has(img))) {
          debugInfo.push(`New version ${newVersion} matches old ${oldVersion}`);
          matched = true;

          // Find what’s missing
          const missingImages = [...oldSet].filter(img => !newSet.has(img));
          if (missingImages.length > 0) {
            debugInfo.push(`New version ${newVersion} is missing image updates`);
            hasImageUpdates = true; // ✅ Fix: Set flag if we detect missing images
            for (const img of missingImages) {
              if (img.includes("registry1.dso.mil")) {
                labels.add("waiting on ironbank");
              } else if (img.includes("cgr.dev")) {
                labels.add("waiting on cgr");
              }
            }
          }
        }
      }
    }

    if (!matched) {
      debugInfo.push(`No match found for new version: ${newVersion}`);
      hasImageUpdates = true;
    }
  }

  // Detect Major Version Bumps 🔥
  for (const imgName in oldVersionMap) {
    if (newVersionMap[imgName]) {
      // Get the latest versions from both old and new
      const oldVersions = Object.keys(oldVersionMap[imgName]).sort(semver.compare);
      const newVersions = Object.keys(newVersionMap[imgName]).sort(semver.compare);

      if (oldVersions.length && newVersions.length) {
        const latestOld = oldVersions[oldVersions.length - 1];
        const latestNew = newVersions[newVersions.length - 1];

        if (semver.valid(latestOld) && semver.valid(latestNew)) {
          if (semver.diff(latestOld, latestNew) === "major") {
            debugInfo.push(
              `Major bump detected for image: ${imgName} from ${latestOld} to ${latestNew}`,
            );
            labels.add("major-image-update");
            hasImageUpdates = true;
          }
        }
      }
    }
  }

  // 🔍 **Determine Final Labels**
  if (hasHelmUpdates && !hasImageUpdates) {
    labels.add("helm-chart-only");
  }

  if (
    !labels.has("waiting on ironbank") &&
    !labels.has("waiting on cgr") &&
    !labels.has("helm-chart-only")
  ) {
    labels.add("needs-review");
  }

  // Output debug info (useful for CI logs)
  debugInfo.forEach(line => console.log(`[DEBUG] ${line}`));

  // Output labels as a CSV for `gh pr edit`
  console.log(Array.from(labels).join(","));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
