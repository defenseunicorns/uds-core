// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
import assert from 'node:assert/strict';
import test from 'node:test';
import { retainSignedRemoteCharts } from './signed-inputs.mjs';

test('updating Core cannot silently reuse an older signed Istio chart', () => {
  const component={name:'istio-controlplane',charts:[{name:'istiod',version:'1.31.2',url:'https://blob.istio.io/istio-release/charts'}]};
  assert.throws(()=>retainSignedRemoteCharts(component,{'istio-controlplane/istiod':'/verified/istiod-1.30.3.tgz'}), /Signed chart version differs/);
  assert.equal(component.charts[0].localPath,undefined);
  retainSignedRemoteCharts(component,{'istio-controlplane/istiod':'/verified/istiod-1.31.2.tgz'});
  assert.equal(component.charts[0].localPath,'/verified/istiod-1.31.2.tgz');
  assert.equal(component.charts[0].url,undefined);
});
