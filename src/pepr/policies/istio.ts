/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { a, sdk } from "pepr";

import { Policy } from "../operator/crd";
import { When } from "./common";
import { isExempt, markExemption } from "./exemptions";

const { containers } = sdk;

/**
 * This policy prevents the usage of Istio annotations to override sidecar behavior/configuration.
 *
 * Istio annotations can be used to override the default sidecar behavior, which can lead to
 * security vulnerabilities or misconfigurations. This policy ensures that annotations that can
 * potentially override secure sidecar behavior are not used on pods.
 */
When(a.Pod)
  .IsCreatedOrUpdated()
  .Mutate(markExemption(Policy.RestrictIstioSidecarOverrides))
  .Validate(request => {
    if (isExempt(request, Policy.RestrictIstioSidecarOverrides)) {
      return request.Approve();
    }

    // ref: https://istio.io/latest/docs/reference/config/annotations/
    const blockedAnnotations = [
      "sidecar.istio.io/bootstrapOverride", // Overrides entire Envoy bootstrap config
      "sidecar.istio.io/discoveryAddress", // Can redirect sidecar to an untrusted control plane
      "sidecar.istio.io/proxyImage", // Allows use of arbitrary proxy images
      "proxy.istio.io/config", // Fully overrides proxy configuration
      "sidecar.istio.io/userVolume", // Adds custom volumes to the sidecar container
      "sidecar.istio.io/userVolumeMount", // Adds custom volume mounts to the sidecar container
    ];

    const annotations = request.Raw?.metadata?.annotations || {};

    const violations = Object.keys(annotations)
      .filter(annotation => {
        return blockedAnnotations.includes(annotation);
      })
      .sort((a, b) => a.localeCompare(b));

    if (violations.length > 0) {
      // TODO: Remove this line to enforce the block
      return request.Approve([
        [
          "The following istio annotations can modify secure sidecar configuration and should be removed/exempted: ",
          violations.join(", "),
        ].join(""),
      ]);
      // TODO: Uncomment this line to block the request
      // return request.Deny(
      //   `The following istio annotations can modify secure sidecar configuration and are not allowed: ${violations.join(", ")}`,
      // );
    }

    return request.Approve();
  });

/**
 * This policy prevents the usage of Istio annotations or labels that override traffic interception behavior.
 *
 * Istio traffic annotations or labels can be used to modify how traffic is intercepted and routed, which can
 * lead to security bypasses or unintended network paths. This policy ensures that annotations or labels that
 * can potentially bypass secure networking controls are not used on pods.
 */
When(a.Pod)
  .IsCreatedOrUpdated()
  .Mutate(markExemption(Policy.RestrictIstioTrafficOverrides))
  .Validate(request => {
    if (isExempt(request, Policy.RestrictIstioTrafficOverrides)) {
      return request.Approve();
    }

    const blockedTrafficAnnotations = [
      "sidecar.istio.io/inject", // Can disable sidecar injection
      "traffic.sidecar.istio.io/excludeInboundPorts", // Can bypass inbound port interception
      "traffic.sidecar.istio.io/excludeInterfaces", // Can exclude network interfaces from interception
      "traffic.sidecar.istio.io/excludeOutboundIPRanges", // Can bypass outbound IP range interception
      "traffic.sidecar.istio.io/excludeOutboundPorts", // Can bypass outbound port interception
      "traffic.sidecar.istio.io/includeInboundPorts", // Can modify inbound port interception
      "traffic.sidecar.istio.io/includeOutboundIPRanges", // Can modify outbound IP range interception
      "traffic.sidecar.istio.io/includeOutboundPorts", // Can modify outbound port interception
      "sidecar.istio.io/interceptionMode", // Can change interception mode (REDIRECT/TPROXY)
      "traffic.sidecar.istio.io/kubevirtInterfaces", // Can modify kubevirt interface handling
    ];

    const blockedTrafficLabels = [
      "sidecar.istio.io/inject", // Can disable sidecar injection
    ];

    const namespace = request.Raw?.metadata?.namespace || "default";
    const annotations = request.Raw?.metadata?.annotations || {};
    const labels = request.Raw?.metadata?.labels || {};

    // Check annotations for violations
    const annotationViolations = Object.entries(annotations)
      .filter(([key]) => {
        if (
          // Ignore 'sidecar.istio.io/inject' annotation in istio-system namespace
          (key === "sidecar.istio.io/inject" && namespace === "istio-system") ||
          // Ignore 'sidecar.istio.io/inject=true' annotation
          (key === "sidecar.istio.io/inject" && annotations[key].trim() === "true")
        ) {
          return false;
        }

        return blockedTrafficAnnotations.includes(key);
      })
      .map(([key]) => `annotation ${key}`);

    // Check if the pod is an Istio waypoint pod so we can ignore it when checking side inject label
    let isIstioWaypointPod = false;
    for (const container of containers(request)) {
      if (
        container.name === "istio-proxy" &&
        container.ports?.some(p => p.name === "http-envoy-prom") &&
        container.args?.some(arg => arg === "proxy") &&
        container.args?.some(arg => arg === "waypoint")
      ) {
        isIstioWaypointPod = true;
        break;
      }
    }

    // Check labels for violations
    const labelViolations = Object.entries(labels)
      .filter(([key, value]) => {
        if (
          // Ignore 'sidecar.istio.io/inject' label in istio-system namespace
          (key === "sidecar.istio.io/inject" && namespace === "istio-system") ||
          // Ignore 'sidecar.istio.io/inject=true' label
          (key === "sidecar.istio.io/inject" && value.trim() === "true") ||
          // Ignore labels on Istio waypoint pods
          (key === "sidecar.istio.io/inject" && isIstioWaypointPod)
        ) {
          return false;
        }

        return blockedTrafficLabels.includes(key);
      })
      .map(([key]) => `label ${key}`);

    // Combine all violations and sort
    const violations = [...annotationViolations, ...labelViolations].sort((a, b) =>
      a.localeCompare(b),
    );

    if (violations.length > 0) {
      // TODO: Remove this line to enforce the block
      return request.Approve([
        [
          "The following istio annotations or labels can modify secure traffic interception and should be removed/exempted: ",
          violations.join(", "),
        ].join(""),
      ]);
      // TODO: Uncomment this line to block the request
      // return request.Deny(
      //   `The following istio annotations or labels can modify secure traffic interception are not allowed: ${violations.join(", ")}`,
      // );
    }

    return request.Approve();
  });

/**
 * This policy prevents the use of any Istio Annotations that override default secure ambient mesh behavior on Pods.
 *
 * Istio allows some annotations to be used to override default secure ambient mesh behavior, such as traffic interception
 * This policy blocks all such annotations to prevent security vulnerabilities or misconfigurations.
 */
When(a.Pod)
  .IsCreatedOrUpdated()
  .Mutate(markExemption(Policy.RestrictIstioAmbientOverrides))
  .Validate(request => {
    if (isExempt(request, Policy.RestrictIstioAmbientOverrides)) {
      return request.Approve();
    }

    const annotations = request.Raw?.metadata?.annotations || {};
    const ambientBlockedAnnotations = [
      "ambient.istio.io/bypass-inbound-capture", // Bypasses inbound traffic capture in ambient mesh mode
    ];

    const violations = Object.keys(annotations)
      .filter(annotation => ambientBlockedAnnotations.includes(annotation))
      .sort((a, b) => a.localeCompare(b));

    if (violations.length > 0) {
      // TODO: Remove this line to enforce the block
      return request.Approve([
        [
          "The following istio ambient annotations can modify secure mesh behavior and should be removed/exempted: ",
          violations.join(", "),
        ].join(""),
      ]);
      // TODO: Uncomment this line to block the request
      // return request.Deny(
      //   `The following istio ambient annotations that can modify secure mesh behavior are not allowed: ${violations.join(", ")}`,
      // );
    }

    return request.Approve();
  });
