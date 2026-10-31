// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
import assert from 'node:assert/strict';
import test from 'node:test';
import { zarfDockerEnvironment } from './zarf-docker-api.mjs';

test('package creation pins the qualified export API without changing other tool settings', () => {
  const environment = { DOCKER_API_VERSION: '1.56', DOCKER_CONFIG: '/explicit/docker', PATH: '/trusted/tools' };
  assert.deepEqual(zarfDockerEnvironment('1.45', environment), { ...environment, DOCKER_API_VERSION: '1.45' });
  assert.equal(environment.DOCKER_API_VERSION, '1.56');
  for (const version of [undefined, '', '1.48', '1.56']) assert.throws(() => zarfDockerEnvironment(version, environment));
});
