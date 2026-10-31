// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
import assert from 'node:assert/strict';
import test from 'node:test';
import {privateGatewayServices} from './validate-render.mjs';

const objects=()=>['admin','tenant'].map(role=>({kind:'Service',metadata:{name:`${role}-ingressgateway`,namespace:`istio-${role}-gateway`},spec:{type:'ClusterIP',selector:{istio:`${role}-gateway`},ports:[{port:15021},{port:80},{port:443}]}}));

test('private gateway profile keeps distinct services and real HTTP/TLS listeners',()=>{
  assert.equal(privateGatewayServices(objects()).length,2);
  for(const mutate of [o=>{o[0].spec.type='LoadBalancer';},o=>{o.pop();},o=>{o[0].spec.ports=[{port:80}];},o=>{o[1].spec.selector=o[0].spec.selector;}]){
    const input=objects();mutate(input);assert.throws(()=>privateGatewayServices(input));
  }
});
