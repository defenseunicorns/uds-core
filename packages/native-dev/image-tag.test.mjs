// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
import assert from 'node:assert/strict';
import test from 'node:test';
import { controllerImageTag, frozenControllerTag } from './image-tag.mjs';

test('source-only provenance updates cannot overwrite a qualified binary tag', () => {
  const binary = 'a'.repeat(64), source = 'b'.repeat(64);
  assert.equal(controllerImageTag(binary, source), controllerImageTag(binary, source));
  assert.notEqual(controllerImageTag(binary, source), controllerImageTag(binary, 'c'.repeat(64)));
  assert.notEqual(controllerImageTag(binary, source), controllerImageTag('d'.repeat(64), source));
  assert.throws(() => controllerImageTag(binary.slice(0, 20), source));
  assert.throws(() => controllerImageTag(binary, 'malformed'));
});

test('an explicit frozen receipt retains its exact previously qualified tag', () => {
  assert.equal(frozenControllerTag('docker.io/library/uds-core-native-controller:00f512ee7ea116e9f0a6'), '00f512ee7ea116e9f0a6');
  for (const image of ['foreign/controller:tag', 'docker.io/library/uds-core-native-controller:', 'docker.io/library/uds-core-native-controller:tag,OTHER=value']) {
    assert.throws(() => frozenControllerTag(image));
  }
});
