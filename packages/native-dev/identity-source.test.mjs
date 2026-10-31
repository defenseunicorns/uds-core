// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { verifyIdentitySource } from './identity-source.mjs';

test('frozen identity images reject changed and newly added compiler inputs', t => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'native-identity-source-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const module=path.join(root,'src/dev-identity');
  fs.mkdirSync(path.join(module,'cmd/dev-identity'),{recursive:true});
  const contents={'go.mod':'module example.test/identity\n\ngo 1.27\n','go.sum':'','cmd/dev-identity/main.go':'package main\nfunc main() {}\n'};
  const bridgeSourceFiles={};
  for(const [name,body] of Object.entries(contents)) {
    fs.writeFileSync(path.join(module,name),body);
    bridgeSourceFiles[name]=crypto.createHash('sha256').update(body).digest('hex');
  }
  const providerRecipeFiles={};
  for(const name of ['build-images.py','provider-inputs.json','dex-core-dev.patch','Dockerfile.bridge','Dockerfile.dex']) {
    fs.writeFileSync(path.join(module,name),'frozen recipe\n');
    providerRecipeFiles[name]=crypto.createHash('sha256').update('frozen recipe\n').digest('hex');
  }
  const options={root,go:process.env.GO_BINARY || 'go',identity:{bridgeSourceFiles,providerRecipeFiles},run:(cmd,args,options)=>execFileSync(cmd,args,{...options,encoding:'utf8'})};
  assert.deepEqual(verifyIdentitySource(options),bridgeSourceFiles);
  fs.appendFileSync(path.join(module,'dex-core-dev.patch'),'changed Dex behavior\n');
  assert.throws(()=>verifyIdentitySource(options),/Identity build recipe differs/);
  fs.writeFileSync(path.join(module,'dex-core-dev.patch'),'frozen recipe\n');
  fs.writeFileSync(path.join(module,'cmd/dev-identity/added.go'),'package main\nconst added = true\n');
  assert.throws(()=>verifyIdentitySource(options),/Identity compiler inputs differ/);
  fs.rmSync(path.join(module,'cmd/dev-identity/added.go'));
  fs.writeFileSync(path.join(module,'cmd/dev-identity/added_amd64.s'),'// Assembly is also a compiler input.\n');
  assert.throws(()=>verifyIdentitySource(options),/Identity compiler inputs differ/);
  fs.rmSync(path.join(module,'cmd/dev-identity/added_amd64.s'));
  fs.appendFileSync(path.join(module,'cmd/dev-identity/main.go'),'// changed runtime source\n');
  assert.throws(()=>verifyIdentitySource(options),/Identity compiler inputs differ/);
});
