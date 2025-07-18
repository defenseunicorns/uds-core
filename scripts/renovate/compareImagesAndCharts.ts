/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import * as fs from "fs";
import * as path from "path";
import * as semver from "semver";
import * as yaml from "yaml";

interface ComparisonResult {
  changes: string[];
  labels: string[];
}

/**
 * Compares images and charts between two extract folders
 * @param oldPath - Path to the old extract folder
 * @param newPath - Path to the new extract folder
 * @returns ComparisonResult with changes and labels
 */
export async function compareImagesAndCharts(
  oldPath: string,
  newPath: string,
): Promise<ComparisonResult> {
  const result: ComparisonResult = {
    changes: [],
    labels: [],
  };

  try {
    // Load chart data
    const oldCharts = loadYamlFile(path.join(oldPath, "charts.yaml")) as Record<string, string>;
    const newCharts = loadYamlFile(path.join(newPath, "charts.yaml")) as Record<string, string>;

    // Load image data
    const oldImages = loadYamlFile(path.join(oldPath, "images.yaml")) as Record<string, string[]>;
    const newImages = loadYamlFile(path.join(newPath, "images.yaml")) as Record<string, string[]>;

    // Compare charts
    const hasHelmUpdates = compareCharts(oldCharts, newCharts, result);

    // Compare images
    const hasImageUpdates = compareImages(oldImages, newImages, result);

    // Add helm-chart-only label if applicable
    if (hasHelmUpdates && !hasImageUpdates) {
      result.labels.push("helm-chart-only");
      result.changes.push("PR contains only helm chart updates");
    }

    // If no waiting labels were added, add needs-review
    if (
      !result.labels.includes("waiting on ironbank") &&
      !result.labels.includes("waiting on rapidfort") &&
      !result.labels.includes("helm-chart-only")
    ) {
      result.labels.push("needs-review");
    }
  } catch (error: unknown) {
    console.error(`Error comparing artifacts: ${error}`);
    result.changes = [
      `Error comparing artifacts: ${error instanceof Error ? error.message : String(error)}`,
    ];

    // When running from command line, this error will be caught by the catch block
    // and will cause the process to exit with code 1
    throw error;
  }

  // Output results
  console.log("Changes:");
  result.changes.forEach(change => console.log(`- ${change}`));

  console.log("Labels:");
  result.labels.forEach(label => console.log(`- ${label}`));

  // Output comma-separated labels for GitHub CLI
  console.log(`LABELS=${result.labels.join(",")}`);

  return result;
}

/**
 * Loads a YAML file and returns its parsed content
 * @param filePath - Path to the YAML file
 * @returns Parsed YAML content
 */
// Define a type for YAML content structure
type YamlContent = Record<string, unknown> | unknown[];

function loadYamlFile(filePath: string): YamlContent {
  try {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File does not exist: ${filePath}`);
    }

    const content = fs.readFileSync(filePath, "utf8");

    // If content is already an object (for testing), return it
    if (typeof content !== "string") {
      return content as YamlContent;
    }

    // Empty file is allowed, return empty object
    if (!content.trim()) {
      return {};
    }

    try {
      const parsed = yaml.parse(content);
      return parsed || {};
    } catch (error: unknown) {
      console.error(`Error parsing YAML in ${filePath}: ${error}`);
      throw new Error(`Invalid YAML content in ${filePath}`);
    }
  } catch (error: unknown) {
    console.error(`Error loading ${filePath}: ${error}`);
    // Propagate the error
    throw error;
  }
}

/**
 * Compares charts between old and new versions
 * @param oldCharts - Old charts data
 * @param newCharts - New charts data
 * @param result - Result object to update
 * @returns Boolean indicating if there are helm updates
 */
function compareCharts(
  oldCharts: Record<string, string>,
  newCharts: Record<string, string>,
  result: ComparisonResult,
): boolean {
  let hasHelmUpdates = false;

  // Check for chart updates
  for (const chartKey in oldCharts) {
    const oldVersion = oldCharts[chartKey];
    const newVersion = newCharts[chartKey];

    if (oldVersion !== newVersion) {
      hasHelmUpdates = true;
      result.changes.push(`Chart ${chartKey} updated from ${oldVersion} to ${newVersion}`);

      // Check if this is a major update
      if (
        semver.valid(oldVersion) &&
        semver.valid(newVersion) &&
        semver.diff(oldVersion, newVersion) === "major"
      ) {
        result.labels.push("major-helm-update");
        result.changes.push(`Major helm chart update detected for ${chartKey}`);
      }
    }
  }

  return hasHelmUpdates;
}

/**
 * Compares images between old and new versions
 * @param oldImages - Old images data
 * @param newImages - New images data
 * @param result - Result object to update
 * @returns Boolean indicating if there are image updates
 */
function compareImages(
  oldImages: Record<string, string[]>,
  newImages: Record<string, string[]>,
  result: ComparisonResult,
): boolean {
  let hasImageUpdates = false;

  // Check for image updates
  const oldVersions = Object.keys(oldImages).sort();
  const newVersions = Object.keys(newImages).sort();

  // Check if any versions are different
  if (JSON.stringify(oldVersions) !== JSON.stringify(newVersions)) {
    hasImageUpdates = true;
  }

  // Build maps of version-to-images for comparison
  const oldVersionMap: Record<string, string[]> = {};
  for (const version in oldImages) {
    oldVersionMap[version] = oldImages[version].map((img: string) => img.split(":")[0]);
  }

  const newVersionMap: Record<string, string[]> = {};
  for (const version in newImages) {
    newVersionMap[version] = newImages[version].map((img: string) => img.split(":")[0]);
  }

  // Create a map of all image base names to their versions in the new data
  const allNewImageVersions: Record<string, string[]> = {};
  for (const version in newImages) {
    for (const img of newImages[version]) {
      const imgName = img.split(":")[0];
      if (!allNewImageVersions[imgName]) {
        allNewImageVersions[imgName] = [];
      }
      allNewImageVersions[imgName].push(version);
    }
  }

  // For each new version list, check if it's a subset of an old version list
  for (const newVersion in newVersionMap) {
    const newImageNames = newVersionMap[newVersion];
    let foundMatch = false;

    for (const oldVersion in oldVersionMap) {
      const oldImageNames = oldVersionMap[oldVersion];

      // Check if identical
      if (JSON.stringify(oldImageNames.sort()) === JSON.stringify(newImageNames.sort())) {
        foundMatch = true;
        checkForMajorUpdate(oldVersion, newVersion, result);
        break;
      }

      // Check if subset
      if (isSubset(newImageNames, oldImageNames)) {
        foundMatch = true;

        // Find the images that are in old but not in new
        const missingImageNames = oldImageNames.filter(
          (name: string) => !newImageNames.includes(name),
        );

        // Get the full image strings for the missing images
        const missingImageStrings = oldImages[oldVersion].filter((img: string) => {
          const imgName = img.split(":")[0];
          return missingImageNames.includes(imgName);
        });

        // Check registry prefixes and add appropriate labels
        for (const missingImg of missingImageStrings) {
          const imgName = missingImg.split(":")[0];

          // Check if this image exists in any newer version
          const existsInNewerVersion = allNewImageVersions[imgName]?.some(
            ver => semver.valid(ver) && semver.valid(newVersion) && semver.gt(ver, newVersion),
          );

          // Skip if the image exists in a newer version
          if (existsInNewerVersion) {
            continue;
          }

          if (missingImg.includes("registry1.dso.mil")) {
            if (!result.labels.includes("waiting on ironbank")) {
              result.labels.push("waiting on ironbank");
              result.changes.push(`Waiting on Ironbank image update: ${missingImg}`);
            }
          } else if (missingImg.startsWith("quay.io/rfcurated")) {
            if (!result.labels.includes("waiting on rapidfort")) {
              result.labels.push("waiting on rapidfort");
              result.changes.push(`Waiting on Rapidfort image update: ${missingImg}`);
            }
          }
        }

        // Check if this is a major version update
        checkForMajorUpdate(oldVersion, newVersion, result);
        break;
      }
    }

    if (!foundMatch) {
      console.warn(`Warning: No matching or subset found for image version ${newVersion}`);
    }
  }

  return hasImageUpdates;
}

/**
 * Checks if array a is a subset of array b
 * @param a - First array
 * @param b - Second array
 * @returns Boolean indicating if a is a subset of b
 */
function isSubset(a: string[], b: string[]): boolean {
  return a.every(val => b.includes(val));
}

/**
 * Checks if there's a major version update between two versions and updates the result
 * @param oldVersion - Old version string
 * @param newVersion - New version string
 * @param result - Result object to update
 * @returns Boolean indicating if a major update was detected
 */
function checkForMajorUpdate(oldVersion: string, newVersion: string, result: ComparisonResult) {
  if (
    oldVersion !== newVersion &&
    semver.valid(oldVersion) &&
    semver.valid(newVersion) &&
    semver.diff(oldVersion, newVersion) === "major"
  ) {
    if (!result.labels.includes("major-image-update")) {
      result.labels.push("major-image-update");
    }
    result.changes.push(`Major image update detected: ${oldVersion} to ${newVersion}`);
  }
}

// If called directly from command line
if (require.main === module) {
  const oldPath = process.argv[2];
  const newPath = process.argv[3];

  if (!oldPath || !newPath) {
    console.error("Please provide old and new paths");
    process.exit(1);
  }

  compareImagesAndCharts(oldPath, newPath)
    .then(() => process.exit(0))
    .catch(error => {
      console.error(error);
      process.exit(1);
    });
}
