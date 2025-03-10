#!/usr/bin/env ts-node
/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

/**
 * getImagesAndCharts.ts
 *
 * This script scans a provided folder for zarf.yaml files, extracts:
 *  1) all charts (excluding localPath ones)
 *  2) all images
 * Then outputs them to two YAML files: "charts.yaml" and "images.yaml" in the `extract` subfolder.
 *
 * Usage:
 *   npx ts-node getImagesAndCharts.ts --path someFolder
 */

import * as fs from "fs";
import * as path from "path";
import * as process from "process";
import YAML, { parse as parseYaml } from "yaml";

interface ChartEntry {
  name: string;
  url?: string;
  version?: string;
}

interface ImageEntry {
  name: string; // registry/repo
  tag: string; // semver or partial
}

interface ZarfComponent {
  charts?: {
    name: string;
    url?: string;
    version?: string;
    localPath?: string;
  }[];
  images?: string[];
}

interface ZarfFile {
  kind: string;
  metadata: {
    name: string;
  };
  components?: ZarfComponent[];
}

function walkDir(start: string, callback: (filePath: string) => void) {
  const files = fs.readdirSync(start, { withFileTypes: true });
  for (const f of files) {
    const curPath = path.join(start, f.name);
    if (f.isDirectory()) {
      walkDir(curPath, callback);
    } else if (f.isFile()) {
      callback(curPath);
    }
  }
}

function parseImages(images: string[] | undefined): ImageEntry[] {
  if (!images) return [];
  const results: ImageEntry[] = [];
  for (const i of images) {
    const lastColonIdx = i.lastIndexOf(":");
    if (lastColonIdx <= 0) {
      // no tag found, default maybe
      continue;
    }
    const name = i.slice(0, lastColonIdx);
    let tag = i.slice(lastColonIdx + 1);

    // remove 'v' prefix
    if (tag.startsWith("v")) {
      tag = tag.substring(1);
    }
    // remove any suffixes starting with '-'
    tag = tag.replace(/-.*/, "");

    results.push({ name, tag });
  }
  return results;
}

function parseCharts(charts: ZarfComponent["charts"] | undefined): ChartEntry[] {
  if (!charts) return [];
  const results: ChartEntry[] = [];
  for (const c of charts) {
    // skip localPath
    if (c.localPath) continue;
    results.push({
      name: c.name,
      url: c.url,
      version: c.version,
    });
  }
  return results;
}

async function main() {
  const args = process.argv.slice(2);
  let folder = ".";
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--path") {
      folder = args[i + 1];
    }
  }

  const zarfFiles: string[] = [];
  walkDir(folder, p => {
    if (p.endsWith("zarf.yaml")) {
      zarfFiles.push(p);
    }
  });

  const allCharts: Record<string, string> = {}; // chartRef -> version
  // For chartRef, you could do something like `${url}/${name}` but watch out for undefined url
  const allImages: Record<string, Set<string>> = {}; // imageName -> set of tags

  for (const zf of zarfFiles) {
    const contents = fs.readFileSync(zf, "utf-8");
    let data: ZarfFile;
    try {
      data = parseYaml(contents);
    } catch (e) {
      console.error(`Failed to parse ${zf}: ${e}`);
      continue;
    }
    if (!data.components) continue;
    for (const comp of data.components) {
      // parse charts
      const cList = parseCharts(comp.charts);
      cList.forEach(c => {
        // build some unique key
        const chartRef = (c.url ? c.url : "local") + "/" + c.name;
        if (!c.version) return;
        // store the version
        // We’ll just keep it simple: last one wins
        allCharts[chartRef] = c.version;
      });

      // parse images
      const iList = parseImages(comp.images);
      iList.forEach(img => {
        if (!allImages[img.name]) {
          allImages[img.name] = new Set();
        }
        allImages[img.name].add(img.tag);
      });
    }
  }

  // Output to folder/extract
  const outDir = path.join(folder, "extract");
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  // charts.yaml
  const chartsObj: Record<string, string> = {};
  Object.keys(allCharts)
    .sort()
    .forEach(ref => {
      chartsObj[ref] = allCharts[ref];
    });
  fs.writeFileSync(path.join(outDir, "charts.yaml"), YAML.stringify(chartsObj));

  // images.yaml
  const imagesObj: Record<string, string[]> = {};
  const sortedImageNames = Object.keys(allImages).sort();
  for (const imgName of sortedImageNames) {
    imagesObj[imgName] = Array.from(allImages[imgName]).sort();
  }
  fs.writeFileSync(path.join(outDir, "images.yaml"), YAML.stringify(imagesObj));

  console.log(`Extracted ${zarfFiles.length} zarf.yaml files from ${folder}`);
  console.log(`Charts found: ${Object.keys(chartsObj).length}`);
  console.log(`Images found: ${sortedImageNames.length}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
