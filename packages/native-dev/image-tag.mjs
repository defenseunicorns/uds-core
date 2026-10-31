// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

// Reference fixtures, chart input and documentation can change provenance while
// leaving the executable unchanged. Both hashes identify a new immutable build.
export function controllerImageTag(binarySHA256, sourceSHA256) {
  for (const value of [binarySHA256, sourceSHA256]) {
    if (!/^[a-f0-9]{64}$/.test(value || '')) throw new Error('Controller image inputs require full SHA256 digests');
  }
  return `b${binarySHA256.slice(0, 20)}-s${sourceSHA256.slice(0, 20)}`;
}

export function frozenControllerTag(image) {
  const prefix = 'docker.io/library/uds-core-native-controller:';
  if (!image?.startsWith(prefix) || !/^[a-z0-9][a-z0-9_.-]{0,127}$/.test(image.slice(prefix.length))) {
    throw new Error('Frozen controller receipt must identify the native controller repository and a concrete tag');
  }
  return image.slice(prefix.length);
}
