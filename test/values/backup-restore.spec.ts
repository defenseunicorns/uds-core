/**
 * Copyright 2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { beforeAll, describe, expect, it } from "vitest";
import { findResource, renderManifests, resourceString, K8sResource } from "./helpers.js";

const PKG = "backup-restore";

describe("backup-restore package values", () => {
  let manifests: K8sResource[];

  beforeAll(async () => {
    manifests = await renderManifests(PKG, {
      values: {
        velero: {
          velero: {
            configuration: {
              backupStorageLocation: [
                {
                  name: "default",
                  provider: "aws",
                  bucket: "PROBE_VISIBLE_BUCKET",
                  config: {
                    region: "us-east-1",
                    s3ForcePathStyle: true,
                    s3Url: "http://object-store.example.com",
                  },
                },
              ],
            },
          },
        },
      },
    });
  });

  it("applies storage bucket overrides to the BackupStorageLocation", () => {
    const storageLocation = findResource(manifests, "BackupStorageLocation", "default", "velero");
    expect(resourceString(storageLocation, "spec", "objectStorage", "bucket")).toBe(
      "PROBE_VISIBLE_BUCKET",
    );
  });
});
