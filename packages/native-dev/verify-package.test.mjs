// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { verifyPackage } from './verify-package.mjs';

test('repeated verification cannot preload stale blobs from an earlier package', t => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'native-package-verification-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const payload=path.join(root,'payload'),out=path.join(root,'out');
  fs.mkdirSync(path.join(payload,'images'),{recursive:true});
  const image='docker.io/library/uds-core-native-controller:fixed';
  const digest=`sha256:${'a'.repeat(64)}`;
  const index=JSON.stringify({manifests:[{digest,annotations:{'org.opencontainers.image.ref.name':image}}]});
  fs.writeFileSync(path.join(payload,'images/index.json'),index);
  const checksum=crypto.createHash('sha256').update(index).digest('hex');
  fs.writeFileSync(path.join(payload,'checksums.txt'),`${checksum}  images/index.json\n`);
  const archive=path.join(root,'package.tar.zst');
  execFileSync('/usr/bin/tar',['--zstd','-cf',archive,'-C',payload,'.']);
  const stale=path.join(out,'package-verification/images/blobs/sha256/old-unreachable-blob');
  fs.mkdirSync(path.dirname(stale),{recursive:true});
  fs.writeFileSync(stale,'previous image payload');
  const lock={controllerImage:image,controllerImageID:digest,identity:{bridgeImage:'unused-bridge',dexImage:'unused-dex'},signedInputVerification:{status:'verified',packages:[{images:[]}]}};
  verifyPackage({archive,lock,expectedImages:[image],out,run:(cmd,args)=>execFileSync(`/usr/bin/${cmd}`,args)});
  assert.equal(fs.existsSync(stale),false);
  assert.equal(fs.readFileSync(path.join(out,'package-verification/images/index.json'),'utf8'),index);
  assert.equal(JSON.parse(fs.readFileSync(path.join(root,'package-receipt.json'))).checksumsVerified,1);
});

test('a package cannot claim signed inputs without a verified upstream receipt', () => {
  for (const signedInputVerification of [undefined, {status:'not-requested',packages:[]}, {status:'verified',packages:[]}]) {
    assert.throws(()=>verifyPackage({lock:{signedInputVerification}}), /requires verified signed upstream inputs/);
  }
});
