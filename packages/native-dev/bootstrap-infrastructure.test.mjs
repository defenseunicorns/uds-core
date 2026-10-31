// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import yaml from 'js-yaml';

test('bootstrap infrastructure includes the actual Core Envoy chart namespaces', () => {
  const helper = fs.readFileSync(new URL('./scripts/fence.go', import.meta.url), 'utf8');
  const match = helper.match(/var infrastructure = \[\]string\{([^}]+)\}/);
  assert.ok(match, 'bootstrap must declare its bounded infrastructure namespace set');
  const infrastructure = new Set(JSON.parse(`[${match[1]}]`));
  const namespaces = new Set();
  for (const file of ['../../src/envoy-gateway/zarf.yaml', '../../src/envoy-gateway/common/zarf.yaml']) {
    const definition = yaml.load(fs.readFileSync(new URL(file, import.meta.url), 'utf8'));
    for (const component of definition.components) {
      for (const chart of component.charts || []) if (chart.namespace) namespaces.add(chart.namespace);
    }
  }
  assert.ok(namespaces.size >= 2, 'both the actual Envoy controller and default gateway namespaces must be checked');
  for (const namespace of namespaces) assert.ok(infrastructure.has(namespace), `bootstrap fence omits ${namespace}`);
});
