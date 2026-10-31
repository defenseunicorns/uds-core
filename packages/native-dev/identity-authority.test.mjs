// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
import assert from 'node:assert/strict';
import test from 'node:test';
import { nativeIdentityAuthority } from './validate-render.mjs';

const objects = () => [
  { kind: 'Role', metadata: { name: 'uds-native-controller-bound-identity', namespace: 'uds-system' }, rules: [
    { apiGroups: [''], resources: ['serviceaccounts'], resourceNames: ['uds-controller'], verbs: ['get'] },
    { apiGroups: [''], resources: ['pods'], verbs: ['get'] },
  ] },
  { kind: 'RoleBinding', metadata: { name: 'uds-native-controller-bound-identity', namespace: 'uds-system' },
    roleRef: { apiGroup: 'rbac.authorization.k8s.io', kind: 'Role', name: 'uds-native-controller-bound-identity' },
    subjects: [{ kind: 'ServiceAccount', name: 'uds-native-identity', namespace: 'keycloak' }] },
];
const bridge = () => ({ coreAudiencePairsEnabled: true, operatorNamespace: 'uds-system', operatorServiceAccount: 'uds-controller' });

test('combined profile explicitly selects provenance-capable native authority', () => {
  assert.deepEqual(nativeIdentityAuthority(objects(), bridge()), bridge());
});

for (const [name, change] of [
  ['default-disabled pairing', (o, b) => { b.coreAudiencePairsEnabled = false; }],
  ['original Pepr principal', (o, b) => { b.operatorNamespace = 'pepr-system'; b.operatorServiceAccount = 'pepr-uds-core'; }],
  ['another controller service account', (o, b) => { b.operatorServiceAccount = 'other'; }],
  ['all service accounts', o => { delete o[0].rules[0].resourceNames; }],
  ['write permission', o => { o[0].rules[0].verbs.push('update'); }],
  ['another identity subject', o => { o[1].subjects[0].name = 'foreign'; }],
  ['cluster-wide role reference', o => { o[1].roleRef.kind = 'ClusterRole'; }],
  ['missing role', o => { o.splice(0, 1); }],
]) {
  test(`combined render rejects ${name}`, () => {
    const o = objects(); const b = bridge(); change(o, b);
    assert.throws(() => nativeIdentityAuthority(o, b));
  });
}
