// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { controllerRequestBudgets } from './validate-render.mjs';

const root=path.resolve(import.meta.dirname,'../..');
const read=name=>yaml.load(fs.readFileSync(path.join(root,name),'utf8'));

test('general request defaults stay bounded and the development override covers every phase',()=>{
  assert.deepEqual(read('src/go-controller/chart/values.yaml').kubernetesAPI,{qps:20,burst:40});
  assert.deepEqual(read('packages/native-dev/values/controller-budget.yaml').kubernetesAPI,{qps:100,burst:200});
  const phases=read('packages/native-dev/zarf.yaml').components.filter(c=>c.name.startsWith('uds-controller-'));
  assert.equal(phases.length,4);
  for(const phase of phases){
    assert.equal(phase.charts.length,1);
    assert.equal(phase.charts[0].valuesFiles.filter(p=>p==='values/controller-budget.yaml').length,1);
  }
});

test('a render cannot silently change request budget or raise controller resources',()=>{
  const controller={spec:{template:{spec:{containers:[{name:'controller',args:['--kube-api-qps=100','--kube-api-burst=200'],resources:{limits:{cpu:'100m',memory:'128Mi'}}}]}}}};
  assert.deepEqual(controllerRequestBudgets([controller]),[{qps:100,burst:200,cpu:'100m',memory:'128Mi'}]);
  for(const field of ['qps','burst','cpu','memory']){
    const invalid=structuredClone(controller);
    const container=invalid.spec.template.spec.containers[0];
    if(field==='qps')container.args[0]='--kube-api-qps=-1';
    if(field==='burst')container.args[1]='--kube-api-burst=0';
    if(field==='cpu')container.resources.limits.cpu='200m';
    if(field==='memory')container.resources.limits.memory='256Mi';
    assert.throws(()=>controllerRequestBudgets([invalid]));
  }
});
