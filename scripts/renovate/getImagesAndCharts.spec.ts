/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import * as fs from "fs";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, Mock, test, vi } from "vitest";
import * as yaml from "yaml";
import { getImagesAndCharts } from "./getImagesAndCharts";

// Mock fs and path modules
vi.mock("fs");
vi.mock("path");

describe("getImagesAndCharts", () => {
  beforeEach(() => {
    // Clear all mocks
    vi.clearAllMocks();

    // Mock path.join to return predictable paths
    (path.join as Mock).mockImplementation((...args) => args.join("/"));

    // Mock fs.existsSync to return false for extract dir
    (fs.existsSync as Mock).mockReturnValue(false);

    // Mock fs.mkdirSync
    (fs.mkdirSync as Mock).mockImplementation(() => undefined);

    // Mock fs.readdirSync for the main directory
    (fs.readdirSync as Mock).mockImplementation(dir => {
      if (dir === "test-dir") {
        return ["zarf.yaml", "common"];
      }
      if (dir === "test-dir/common") {
        return ["zarf.yaml"];
      }
      return [];
    });

    // Mock fs.statSync
    (fs.statSync as Mock).mockImplementation(filePath => ({
      isDirectory: () => filePath.endsWith("common"),
    }));

    // Mock fs.writeFileSync
    (fs.writeFileSync as Mock).mockImplementation(() => undefined);

    // Mock console.error to prevent test output pollution
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    // Restore console.error
    vi.restoreAllMocks();
  });

  test("should extract charts and images from realistic zarf.yaml files", async () => {
    // Mock real-world zarf.yaml files based on the grafana example
    (fs.readFileSync as Mock).mockImplementation(filePath => {
      if (filePath === "test-dir/zarf.yaml") {
        return `
kind: ZarfPackageConfig
metadata:
  name: uds-core-grafana
  description: "UDS Core Grafana"
  url: https://grafana.com/grafana

variables:
  - name: DOMAIN
    description: "Cluster domain"
    default: "uds.dev"

components:
  - name: grafana
    required: true
    only:
      flavor: upstream
    import:
      path: common
    charts:
      - name: grafana
        valuesFiles:
          - values/upstream-values.yaml
    images:
      - docker.io/grafana/grafana:v11.6.0
      - docker.io/curlimages/curl:8.12.1
      - docker.io/library/busybox:1.37.0
      - ghcr.io/kiwigrid/k8s-sidecar:1.30.3

  - name: grafana
    required: true
    only:
      flavor: registry1
    import:
      path: common
    charts:
      - name: grafana
        valuesFiles:
          - values/registry1-values.yaml
    images:
      - registry1.dso.mil/ironbank/opensource/grafana/grafana:11.6.0
      - registry1.dso.mil/ironbank/redhat/ubi/ubi9-minimal:9.5
      - registry1.dso.mil/ironbank/kiwigrid/k8s-sidecar:1.30.3

  - name: grafana
    required: true
    only:
      flavor: unicorn
    import:
      path: common
    charts:
      - name: grafana
        valuesFiles:
          - values/unicorn-values.yaml
    images:
      - quay.io/rfcurated/grafana:11.5.3-jammy-scratch-fips-rfcurated
      - quay.io/rfcurated/busybox:1.37.0-glibc-rf.1-rfcurated
      - quay.io/rfcurated/curl:8.12.1-jammy-scratch-fips-rfcurated
      - quay.io/rfcurated/k8s-sidecar:1.30.3-jammy-scratch-fips-rfcurated-rfhardened
`;
      }
      if (filePath === "test-dir/common/zarf.yaml") {
        return `
kind: ZarfPackageConfig
metadata:
  name: uds-core-grafana-common
  description: "UDS Core Grafana Common"
  url: https://grafana.com/grafana

components:
  - name: grafana
    required: true
    charts:
      - name: uds-grafana-config
        namespace: grafana
        version: 0.1.0
        localPath: ../chart
        valuesFiles:
          - ../chart/values.yaml
      - name: grafana
        url: https://grafana.github.io/helm-charts
        version: 8.11.0
        namespace: grafana
        valuesFiles:
          - ../values/values.yaml
`;
      }
      return "";
    });

    await getImagesAndCharts("test-dir");

    // Check if extract directory was created
    expect(fs.mkdirSync).toHaveBeenCalledWith("test-dir/extract", { recursive: true });

    // Check if charts.yaml was written correctly
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      "test-dir/extract/charts.yaml",
      expect.any(String),
    );

    // Check if images.yaml was written correctly
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      "test-dir/extract/images.yaml",
      expect.any(String),
    );

    // Get the actual content written to charts.yaml
    const chartsContent = (fs.writeFileSync as Mock).mock.calls.find(
      call => call[0] === "test-dir/extract/charts.yaml",
    )![1];

    // Get the actual content written to images.yaml
    const imagesContent = (fs.writeFileSync as Mock).mock.calls.find(
      call => call[0] === "test-dir/extract/images.yaml",
    )![1];

    // Parse the YAML content
    const charts = yaml.parse(chartsContent);
    const images = yaml.parse(imagesContent);

    // Verify charts content - note that local charts are skipped
    expect(charts).toEqual({
      "https://grafana.github.io/helm-charts/grafana": "8.11.0",
    });

    // Verify images content - note that we expect normalized versions
    expect(images).toEqual({
      "11.6.0": [
        "docker.io/grafana/grafana:v11.6.0",
        "registry1.dso.mil/ironbank/opensource/grafana/grafana:11.6.0",
      ],
      "8.12.1": [
        "docker.io/curlimages/curl:8.12.1",
        "quay.io/rfcurated/curl:8.12.1-jammy-scratch-fips-rfcurated",
      ],
      "1.37.0": [
        "docker.io/library/busybox:1.37.0",
        "quay.io/rfcurated/busybox:1.37.0-glibc-rf.1-rfcurated",
      ],
      "1.30.3": [
        "ghcr.io/kiwigrid/k8s-sidecar:1.30.3",
        "registry1.dso.mil/ironbank/kiwigrid/k8s-sidecar:1.30.3",
        "quay.io/rfcurated/k8s-sidecar:1.30.3-jammy-scratch-fips-rfcurated-rfhardened",
      ],
      "11.5.3": ["quay.io/rfcurated/grafana:11.5.3-jammy-scratch-fips-rfcurated"],
      "9.5": ["registry1.dso.mil/ironbank/redhat/ubi/ubi9-minimal:9.5"],
    });
  });

  test("should handle multi-flavor images with same version but different image names", async () => {
    // Mock zarf.yaml with different image names but same versions across flavors
    (fs.readFileSync as Mock).mockImplementation(filePath => {
      if (filePath === "test-dir/zarf.yaml") {
        return `
kind: ZarfPackageConfig
metadata:
  name: uds-core-test
  description: "UDS Core Test"

components:
  - name: test-component
    required: true
    only:
      flavor: upstream
    images:
      - docker.io/library/nginx:1.25.3
      - docker.io/library/postgres:15.4.0

  - name: test-component
    required: true
    only:
      flavor: registry1
    images:
      - registry1.dso.mil/ironbank/opensource/nginx/nginx:1.25.3
      - registry1.dso.mil/ironbank/opensource/postgres/postgresql:15.4.0

  - name: test-component
    required: true
    only:
      flavor: unicorn
    images:
      - quay.io/rfcurated/nginx:1.25.3-slim-jammy-fips-rfcurated-rfhardened
      - quay.io/rfcurated/postgres:15.4.0-slim-jammy-fips-rfcurated-rfhardened
`;
      }
      if (filePath === "test-dir/common/zarf.yaml") {
        return `
kind: ZarfPackageConfig
metadata:
  name: uds-core-test-common
  description: "UDS Core Test Common"
  components:
    - name: test-component
      required: true
`;
      }
      return "";
    });

    await getImagesAndCharts("test-dir");

    // Get the actual content written to images.yaml
    const imagesContent = (fs.writeFileSync as Mock).mock.calls.find(
      call => call[0] === "test-dir/extract/images.yaml",
    )![1];

    // Parse the YAML content
    const images = yaml.parse(imagesContent);

    // Verify images are correctly grouped by version across different flavors
    expect(images).toEqual({
      "1.25.3": [
        "docker.io/library/nginx:1.25.3",
        "registry1.dso.mil/ironbank/opensource/nginx/nginx:1.25.3",
        "quay.io/rfcurated/nginx:1.25.3-slim-jammy-fips-rfcurated-rfhardened",
      ],
      "15.4.0": [
        "docker.io/library/postgres:15.4.0",
        "registry1.dso.mil/ironbank/opensource/postgres/postgresql:15.4.0",
        "quay.io/rfcurated/postgres:15.4.0-slim-jammy-fips-rfcurated-rfhardened",
      ],
    });
  });

  test("should handle empty directory", async () => {
    // Mock empty directory
    (fs.readdirSync as Mock).mockReturnValue([]);

    await getImagesAndCharts("empty-dir");

    // Check if extract directory was created
    expect(fs.mkdirSync).toHaveBeenCalledWith("empty-dir/extract", { recursive: true });

    // Check if empty files were written
    const chartsContent = (fs.writeFileSync as Mock).mock.calls.find(
      call => call[0] === "empty-dir/extract/charts.yaml",
    )![1];

    const imagesContent = (fs.writeFileSync as Mock).mock.calls.find(
      call => call[0] === "empty-dir/extract/images.yaml",
    )![1];

    // Parse the YAML content
    const charts = yaml.parse(chartsContent);
    const images = yaml.parse(imagesContent);

    // Verify empty content
    expect(charts).toEqual({});
    expect(images).toEqual({});
  });

  test("should handle invalid zarf.yaml file", async () => {
    // Mock invalid YAML content
    (fs.readFileSync as Mock).mockImplementation(filePath => {
      if (filePath === "test-dir/zarf.yaml") {
        return `invalid: yaml: content: - [ }`;
      }
      return "";
    });

    await getImagesAndCharts("test-dir");

    // Check if extract directory was created
    expect(fs.mkdirSync).toHaveBeenCalledWith("test-dir/extract", { recursive: true });

    // Check if empty files were written
    const chartsContent = (fs.writeFileSync as Mock).mock.calls.find(
      call => call[0] === "test-dir/extract/charts.yaml",
    )![1];

    const imagesContent = (fs.writeFileSync as Mock).mock.calls.find(
      call => call[0] === "test-dir/extract/images.yaml",
    )![1];

    // Parse the YAML content
    const charts = yaml.parse(chartsContent);
    const images = yaml.parse(imagesContent);

    // Verify empty content
    expect(charts).toEqual({});
    expect(images).toEqual({});
  });

  test("should handle images with beta/rc version tags", async () => {
    // Mock YAML with images having beta/rc version tags
    (fs.readFileSync as Mock).mockImplementation(filePath => {
      if (filePath === "test-dir/zarf.yaml") {
        return `
kind: ZarfPackageConfig
metadata:
  name: test-package
  version: 1.0.0
components:
  - name: component1
    images:
      - registry1.dso.mil/ironbank/postgres:15.2.0
      - quay.io/rfcurated/postgres:15.2.0-slim-jammy-fips-rfcurated-rfhardened
      - docker.io/library/postgres:15.2.0-beta.2
`;
      }
      if (filePath === "test-dir/common/zarf.yaml") {
        return `
kind: ZarfPackageConfig
metadata:
  name: test-package-common
  description: "Test Package Common"
  components:
    - name: component1
      required: true
`;
      }
      return "";
    });

    await getImagesAndCharts("test-dir");

    // Get the actual content written to images.yaml
    const imagesContent = (fs.writeFileSync as Mock).mock.calls.find(
      call => call[0] === "test-dir/extract/images.yaml",
    )![1];

    // Parse the YAML content
    const images = yaml.parse(imagesContent);

    // Verify beta/rc versions are normalized correctly
    expect(images).toEqual({
      "15.2.0": [
        "registry1.dso.mil/ironbank/postgres:15.2.0",
        "quay.io/rfcurated/postgres:15.2.0-slim-jammy-fips-rfcurated-rfhardened",
        "docker.io/library/postgres:15.2.0-beta.2",
      ],
    });
  });
});
