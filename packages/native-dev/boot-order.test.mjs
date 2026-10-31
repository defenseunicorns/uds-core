// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import yaml from 'js-yaml';

test('native cold identity preserves original provider-before-Authservice dependency order', () => {
  const root=path.resolve(import.meta.dirname,'../..');
  const original=yaml.load(fs.readFileSync(path.join(root,'packages/identity-authorization/zarf.yaml'),'utf8')).components.map(c=>c.name);
  const native=yaml.load(fs.readFileSync(path.join(import.meta.dirname,'zarf.yaml'),'utf8')).components.map(c=>c.name);
  assert.ok(original.indexOf('keycloak')<original.indexOf('authservice'));
  assert.ok(native.indexOf('uds-controller-registration')<native.indexOf('keycloak'));
  assert.ok(native.indexOf('keycloak')<native.indexOf('authservice'));
  assert.ok(native.indexOf('authservice')<native.indexOf('native-dev-mutation-bootstrap'));
  assert.ok(native.indexOf('uds-controller-narrow')<native.indexOf('istio-tenant-gateway'));
  assert.ok(native.indexOf('native-dev-private-dns')<native.indexOf('istio-controlplane'));
  const phases=yaml.load(fs.readFileSync(path.join(import.meta.dirname,'zarf.yaml'),'utf8')).components;
  assert.ok(phases.find(c=>c.name==='native-dev-private-dns').actions.onDeploy.before[0].cmd.includes('--phase install'));
  assert.ok(phases.find(c=>c.name==='native-dev-ready').actions.onDeploy.after[0].cmd.includes('--phase verify'));
});
