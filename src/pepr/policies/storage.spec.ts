/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { V1Container, V1Volume } from "@kubernetes/client-node";
import { describe, expect, it } from "vitest";
import { validateHostPathVolumes, validateVolumeTypes } from "./storage.js";

describe("Storage Validation Tests", () => {
  describe("validateVolumeTypes", () => {
    it("should allow all supported volume types", () => {
      const volumes: V1Volume[] = [
        { name: "config", configMap: { name: "test-config" } },
        { name: "csi-vol", csi: { driver: "test-driver" } },
        { name: "downward", downwardAPI: { items: [] } },
        { name: "empty", emptyDir: {} },
        {
          name: "ephemeral",
          ephemeral: {
            volumeClaimTemplate: {
              spec: { accessModes: ["ReadWriteOnce"], resources: { requests: { storage: "1Gi" } } },
            },
          },
        },
        { name: "pvc", persistentVolumeClaim: { claimName: "test-pvc" } },
        { name: "projected", projected: { sources: [] } },
        { name: "secret-vol", secret: { secretName: "test-secret" } },
      ];

      const [isValid] = validateVolumeTypes(volumes);
      expect(isValid).toBe(true);
    });

    it("should reject unsupported volume types", () => {
      const volumes: V1Volume[] = [
        { name: "hostpath", hostPath: { path: "/data" } },
        { name: "unsupported", unknown: {} },
      ] as unknown as V1Volume[];

      const [isValid, invalidVolume] = validateVolumeTypes(volumes);
      expect(isValid).toBe(false);
      expect(invalidVolume).toEqual({ name: "hostpath", type: "hostPath" });
    });

    it("should handle empty volumes array", () => {
      const [isValid] = validateVolumeTypes([]);
      expect(isValid).toBe(true);
    });

    it("should handle unnamed volumes", () => {
      const volumes = [{ configMap: {} }] as V1Volume[];
      const [isValid] = validateVolumeTypes(volumes);
      expect(isValid).toBe(true);
    });
  });

  describe("validateHostPathVolumes", () => {
    it("should allow read-only hostPath volumes", () => {
      const volumes: V1Volume[] = [{ name: "data", hostPath: { path: "/data" } }];
      const containers: V1Container[] = [
        {
          name: "test",
          volumeMounts: [{ name: "data", mountPath: "/mnt/data", readOnly: true }],
        },
      ];

      const [isValid] = validateHostPathVolumes(volumes, containers);
      expect(isValid).toBe(true);
    });

    it("should reject read-write hostPath volumes", () => {
      const volumes: V1Volume[] = [{ name: "data", hostPath: { path: "/data" } }];
      const containers: V1Container[] = [
        {
          name: "test",
          volumeMounts: [{ name: "data", mountPath: "/mnt/data", readOnly: false }],
        },
      ];

      const [isValid, invalidVolume] = validateHostPathVolumes(volumes, containers);
      expect(isValid).toBe(false);
      expect(invalidVolume).toEqual({ name: "data" });
    });

    it("should handle multiple containers with same volume", () => {
      const volumes: V1Volume[] = [{ name: "data", hostPath: { path: "/data" } }];
      const containers: V1Container[] = [
        {
          name: "reader",
          volumeMounts: [{ name: "data", mountPath: "/mnt/read", readOnly: true }],
        },
        {
          name: "writer",
          volumeMounts: [{ name: "data", mountPath: "/mnt/write", readOnly: false }],
        },
      ];

      const [isValid] = validateHostPathVolumes(volumes, containers);
      expect(isValid).toBe(false);
    });

    it("should handle no volumes or containers", () => {
      expect(validateHostPathVolumes([], [])).toEqual([true, null]);
      expect(validateHostPathVolumes([{ name: "test" }], [])).toEqual([true, null]);
    });

    it("should handle unnamed volumes", () => {
      const volumes = [{ hostPath: { path: "/data" } }] as V1Volume[];
      const containers: V1Container[] = [
        {
          name: "test",
          volumeMounts: [{ name: "", mountPath: "/mnt/data" }],
        },
      ];

      const [isValid] = validateHostPathVolumes(volumes, containers);
      expect(isValid).toBe(true);
    });
  });
});
