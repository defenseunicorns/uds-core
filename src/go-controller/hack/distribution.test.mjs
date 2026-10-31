// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import yaml from 'js-yaml';

const root=path.resolve(import.meta.dirname,'../../..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const load=file=>yaml.load(read(file));

test('base and standard install the controller by default, without a Pepr component',()=>{
 for(const pkg of ['base','standard']){
  const doc=load(`packages/${pkg}/zarf.yaml`);
  const names=doc.components.map(c=>c.name);
  for(const required of ['uds-core-tools','uds-crds','uds-operator-config','uds-exemptions','uds-controller-bootstrap','uds-controller']){
   assert(doc.components.some(c=>c.name===required&&c.required===true),`${pkg} lacks required Core component ${required}`);
  }
  assert(!names.some(n=>n.includes('pepr')));
  assert(names.indexOf('istio-controlplane')<names.indexOf('uds-controller-bootstrap'));
  assert(names.indexOf('gateway-api-crds')<names.indexOf('uds-controller-bootstrap'));
 }
});
test('Pepr is neither a root dependency nor a deployed module entry point',()=>{
 const pkg=JSON.parse(read('package.json'));
 assert(!pkg.pepr&&!pkg.dependencies?.pepr&&!pkg.devDependencies?.pepr);
 assert(!fs.existsSync(path.join(root,'pepr.ts')));
 assert(!fs.existsSync(path.join(root,'src/pepr')));
 const lock=JSON.parse(read('package-lock.json'));
 assert(!lock.packages['node_modules/pepr']);
});
test('API schemas and application SDK types are implementation neutral',()=>{
 assert(fs.existsSync(path.join(root,'src/uds-api/index.ts')));
 const api=load('src/uds-api/zarf.yaml');
 assert.equal(api.components[0].charts[0].localPath,'chart');
 assert(!read('src/uds-api/index.ts').includes('pepr'));
});
test('standard Core activates CEL and narrow Go callbacks internally',()=>{
 const active=load('src/go-controller/packaging-values.yaml');
 assert.equal(active.admission.register,true);
 assert.equal(active.nativeAdmission.enabled,true);
 assert.equal(active.nativeAdmission.narrowCallbacks,true);
 const source=load('src/go-controller/zarf.yaml');
 const transition=source.components.find(c=>c.name==='uds-controller').actions.onDeploy.after;
 assert(transition.findIndex(a=>a.cmd.includes(' verify'))<transition.findIndex(a=>a.cmd.includes(' retire')));
 const mappings=source.components.filter(c=>c.name.startsWith('uds-controller')).flatMap(c=>c.charts.flatMap(ch=>ch.values||[]));
 for(const mapping of mappings)assert(mapping.excludePaths.includes('.uds-controller.uds-controller.nativeAdmission'));
});
test('Legacy and Next standard/slim bundles have no implementation selector',()=>{
 for(const name of ['k3d-standard','k3d-slim-dev'])assert(!read(`bundles/${name}/uds-bundle.yaml`).toLowerCase().includes('pepr'));
 for(const name of ['k3d-standard-next','k3d-slim-dev-next']){
  assert(!read(`bundles/${name}/defaults.uds.hcl`).toLowerCase().includes('pepr'));
  assert(!read(`bundles/${name}/values/core-base.yaml`).toLowerCase().includes('pepr'));
 }
});
