/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';

/**
 * Extracts images and charts from zarf.yaml files in a given directory path
 * @param directoryPath - Path to the directory containing zarf.yaml files
 */
export async function getImagesAndCharts(directoryPath: string): Promise<void> {
  console.log(`Extracting images and charts from ${directoryPath}`);

  // Create extract directory if it doesn't exist
  const extractDir = path.join(directoryPath, 'extract');
  if (!fs.existsSync(extractDir)) {
    fs.mkdirSync(extractDir, { recursive: true });
  }

  // Find all zarf.yaml files
  const zarfFiles = findZarfYamlFiles(directoryPath);
  console.log(`Found ${zarfFiles.length} zarf.yaml files`);

  // Extract charts and images
  const charts: Record<string, string> = {};
  const images: Record<string, string[]> = {};

  for (const zarfFile of zarfFiles) {
    try {
      const fileContent = fs.readFileSync(zarfFile, 'utf8');
      const zarfConfig = yaml.parse(fileContent);

      // Extract charts
      extractCharts(zarfConfig, charts);

      // Extract images
      extractImages(zarfConfig, images);
    } catch (error) {
      console.error(`Error processing ${zarfFile}: ${error}`);
    }
  }

  // Write charts to file
  fs.writeFileSync(
    path.join(extractDir, 'charts.yaml'),
    yaml.stringify(charts)
  );

  // Write images to file
  fs.writeFileSync(
    path.join(extractDir, 'images.yaml'),
    yaml.stringify(images)
  );

  console.log(`Extraction complete. Files written to ${extractDir}`);
}

/**
 * Recursively finds all zarf.yaml files in a directory
 * @param dir - Directory to search
 * @returns Array of paths to zarf.yaml files
 */
function findZarfYamlFiles(dir: string): string[] {
  let results: string[] = [];

  const list = fs.readdirSync(dir);

  for (const file of list) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      // Skip the extract directory and node_modules
      if (file !== 'extract' && file !== 'node_modules' && file !== '.git') {
        results = results.concat(findZarfYamlFiles(filePath));
      }
    } else if (file === 'zarf.yaml') {
      results.push(filePath);
    }
  }

  return results;
}

/**
 * Extracts Helm charts from a zarf.yaml configuration
 * @param zarfConfig - Parsed zarf.yaml configuration
 * @param charts - Record to store chart information
 */
function extractCharts(zarfConfig: any, charts: Record<string, string>): void {
  if (!zarfConfig.components) return;

  for (const component of zarfConfig.components) {
    if (component.charts) {
      for (const chart of component.charts) {
        // Skip local path charts
        if (chart.localPath) continue;

        if (chart.url && chart.name && chart.version) {
          const chartKey = `${chart.url}/${chart.name}`;
          charts[chartKey] = chart.version;
        }
      }
    }
  }
}

/**
 * Extracts container images from a zarf.yaml configuration
 * @param zarfConfig - Parsed zarf.yaml configuration
 * @param images - Record to store image information
 */
function extractImages(zarfConfig: any, images: Record<string, string[]>): void {
  if (!zarfConfig.components) return;

  for (const component of zarfConfig.components) {
    if (component.images) {
      for (const image of component.images) {
        if (typeof image === 'string') {
          processImage(image, images);
        }
      }
    }

    // Also check for images in actions
    if (component.actions) {
      for (const action of component.actions) {
        if (action.images) {
          for (const image of action.images) {
            if (typeof image === 'string') {
              processImage(image, images);
            }
          }
        }
      }
    }
  }
}

/**
 * Processes an image string to extract name and normalized version
 * @param imageString - Full image string (e.g., registry1.dso.mil/ironbank/opensource/nginx:1.21.6)
 * @param images - Record to store image information
 */
function processImage(imageString: string, images: Record<string, string[]>): void {
  // Split image name and tag
  const [imageName, imageTag] = imageString.split(':');

  if (!imageName || !imageTag) return;

  // Normalize version by removing 'v' prefix and any suffixes
  let normalizedTag = imageTag;

  // Remove 'v' prefix if present
  if (normalizedTag.startsWith('v')) {
    normalizedTag = normalizedTag.substring(1);
  }

  // Remove suffixes (e.g., -beta.1)
  const versionMatch = normalizedTag.match(/^(\d+\.\d+\.\d+)/);
  if (versionMatch) {
    normalizedTag = versionMatch[1];
  }

  // Add to images record
  if (!images[normalizedTag]) {
    images[normalizedTag] = [];
  }

  if (!images[normalizedTag].includes(imageString)) {
    images[normalizedTag].push(imageString);
  }
}

// If called directly from command line
if (require.main === module) {
  const directoryPath = process.argv[2];
  if (!directoryPath) {
    console.error('Please provide a directory path');
    process.exit(1);
  }

  getImagesAndCharts(directoryPath)
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
