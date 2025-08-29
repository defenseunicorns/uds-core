/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { V1Container, V1Volume, V1VolumeMount } from "@kubernetes/client-node";
import { a, PeprValidateRequest, sdk } from "pepr";

import { Policy } from "../operator/crd";
import { volumes, When } from "./common";
import { isExempt, markExemption } from "./exemptions";

const { containers } = sdk;
/**
 * Restrict Volume Types for Pods
 *
 * Volume types, beyond the core set, should be restricted to limit exposure to potential vulnerabilities
 * in Container Storage Interface (CSI) drivers.  In addition, HostPath volumes should not be allowed
 * because host directories could be exploited to access shared data or escalate privileges.  This policy
 * restricts use of volume types to the allowed list.
 *
 * @related https://repo1.dso.mil/big-bang/product/packages/kyverno-policies/-/blob/main/chart/templates/restrict-volume-types.yaml
 */
When(a.Pod)
  .IsCreatedOrUpdated()
  .Mutate(markExemption(Policy.RestrictVolumeTypes))
  .Validate(request => {
    return restrictVolumeTypes(request);
  });

// List of allowed volume types
export function checkAllowedVolumeTypes(
  volumes: V1Volume[],
  isExempt: boolean,
): { approved: boolean; message?: string } {
  const allowedVolumeTypes = [
    "configMap",
    "csi",
    "downwardAPI",
    "emptyDir",
    "ephemeral",
    "persistentVolumeClaim",
    "projected",
    "secret",
  ];
  if (isExempt) return { approved: true };
  // Check all volumes in the pod spec, if any
  for (const volume of volumes) {
    // Get the volume type, which will be the only key in the volume object other than "name"
    const volumeType = Object.keys(volume).find(key => key !== "name") || "unknown";

    // If the volume type is not in the allowed list, deny the request
    if (!allowedVolumeTypes.includes(volumeType)) {
      return {
        approved: false,
        message: `Volume ${volume.name} has a disallowed volume type of '${volumeType}'.`,
      };
    }
  }

  // All volumes are allowed, so approve the request
  return { approved: true };
}

export function restrictVolumeTypes(request: PeprValidateRequest<a.Pod>) {
  const result = checkAllowedVolumeTypes(
    volumes(request),
    isExempt(request, Policy.RestrictVolumeTypes),
  );
  if (result.approved) return request.Approve();
  return request.Deny(result.message!);
}

/**
 * Restrict hostPath Volume Writable Paths for Pods
 *
 * hostPath volumes consume the underlying node's file system. If hostPath volumes are not universally disabled,
 * they should be required to be read-only. Pods which are allowed to mount hostPath volumes in read/write mode
 * pose a security risk even if confined to a "safe" file system on the host and may escape those confines
 * (see https://blog.aquasec.com/kubernetes-security-pod-escape-log-mounts). This policy checks containers for
 * hostPath volumes and validates they are explicitly mounted in readOnly mode.  It is strongly recommended to
 * pair this policy with another to restrict the path of hostPath volumes to a known list.
 *
 * @related https://repo1.dso.mil/big-bang/product/packages/kyverno-policies/-/blob/main/chart/templates/restrict-host-path-write.yaml
 */
When(a.Pod)
  .IsCreatedOrUpdated()
  .Mutate(markExemption(Policy.RestrictHostPathWrite))
  .Validate(request => {
    return restrictHostPathWrite(request);
  });

export function checkHostPathWrite(
  volumes: V1Volume[],
  containers: V1Container[],
  isExempt: boolean,
): { approved: boolean; message?: string } {
  if (isExempt) return { approved: true };
  for (const volume of volumes) {
    // If the volume is a hostPath
    if (volume.hostPath) {
      // Check all mounts in any container for this volume and verify they are readOnly
      const hasRWMount = containers
        .flatMap((c: V1Container) => c.volumeMounts || [])
        .filter((mount: V1VolumeMount) => mount.name === volume.name)
        .find((mount: V1VolumeMount) => !mount.readOnly);

      // If any mount is not readOnly, deny the request
      if (hasRWMount) {
        return {
          approved: false,
          message: `hostPath volume '${volume.name}' must be mounted as readOnly.`,
        };
      }
    }
  }

  // All volumes are allowed, so approve the request
  return { approved: true };
}

export function restrictHostPathWrite(request: PeprValidateRequest<a.Pod>) {
  const result = checkHostPathWrite(
    volumes(request),
    containers(request),
    isExempt(request, Policy.RestrictHostPathWrite),
  );
  if (result.approved) return request.Approve();
  return request.Deny(result.message!);
}
