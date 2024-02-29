import { a } from "pepr";

import { When, containers, volumes } from "./common";
import { Policy } from "../operator/crd";
import { isExempt, markExemption } from "./exemptions";

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
    // List of allowed volume types
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

    if (isExempt(request, Policy.RestrictVolumeTypes)) {
      return request.Approve();
    }

    // Check all volumes in the pod spec, if any
    for (const volume of volumes(request)) {
      // Get the volume type, which will be the only key in the volume object other than "name"
      const volumeType = Object.keys(volume).find(key => key !== "name") || "unknown";

      // If the volume type is not in the allowed list, deny the request
      if (!allowedVolumeTypes.includes(volumeType)) {
        return request.Deny(
          `Volume ${volume.name} has a disallowed volume type of '${volumeType}'.`,
        );
      }
    }

    // All volumes are allowed, so approve the request
    return request.Approve();
  });

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
    if (isExempt(request, Policy.RestrictHostPathWrite)) {
      return request.Approve();
    }

    for (const volume of volumes(request)) {
      // If the volume is a hostPath
      if (volume.hostPath) {
        // Check all mounts in any container for this volume and verify they are readOnly
        const hasRWMount = containers(request)
          .flatMap(c => c.volumeMounts || [])
          .filter(mount => mount.name === volume.name)
          .find(mount => !mount.readOnly);

        // If any mount is not readOnly, deny the request
        if (hasRWMount) {
          return request.Deny(`hostPath volume '${volume.name}' must be mounted as readOnly.`);
        }
      }
    }

    // All volumes are allowed, so approve the request
    return request.Approve();
  });
