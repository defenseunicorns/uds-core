// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const sha=data=>crypto.createHash('sha256').update(data).digest('hex');
const canonical=name=>name.includes('/')?name:`docker.io/library/${name}`;

export function verifyPackage({archive,lock,expectedImages,out,run}) {
  if (lock.signedInputVerification?.status !== 'verified' || !lock.signedInputVerification.packages.length) {
    throw new Error('Package verification requires verified signed upstream inputs');
  }
  const target=path.join(out,'package-verification');
  // A prior extraction can contain unreachable image blobs. The connected
  // preload must include only this verified package's payload.
  fs.rmSync(target,{recursive:true,force:true});
  fs.mkdirSync(target,{recursive:true});
  run('tar',['--zstd','-xf',archive,'-C',target]);
  const entries=fs.readFileSync(path.join(target,'checksums.txt'),'utf8').trim().split('\n');
  for (const line of entries) {
    const match=line.match(/^([a-f0-9]{64})\s+(.+)$/);
    if (!match) throw new Error('Invalid packaged checksum entry');
    const filename=path.resolve(target,match[2]);
    if (!filename.startsWith(target+path.sep)||sha(fs.readFileSync(filename))!==match[1]) throw new Error(`Native package checksum mismatch: ${match[2]}`);
  }
  const manifests=JSON.parse(fs.readFileSync(path.join(target,'images/index.json'))).manifests;
  const originals=lock.signedInputVerification.packages.flatMap(p=>p.images);
  const frozen=new Map(originals.map(i=>[i.annotations['org.opencontainers.image.ref.name'],i.digest]));
  frozen.set(canonical(lock.identity.bridgeImage),lock.identity.bridgePlatformManifest);
  frozen.set(canonical(lock.identity.dexImage),lock.identity.dexPlatformManifest);
  frozen.set(lock.controllerImage,lock.controllerImageID);
  const expected=new Set(expectedImages.map(canonical));
  for (const image of manifests) {
    const name=image.annotations['org.opencontainers.image.ref.name'];
    if (!expected.delete(name)) throw new Error(`Unexpected packaged runtime image: ${name}`);
    if (frozen.get(name)!==image.digest) throw new Error(`Packaged image differs from verified immutable input: ${name}`);
  }
  if (expected.size) throw new Error('A required image is missing from the native package');
  const receipt={archive:path.resolve(archive),sha256:sha(fs.readFileSync(archive)),bytes:fs.statSync(archive).size,checksumsVerified:entries.length,sourceSHA256:lock.sourceSHA256,signedUpstreamInputsVerified:true,derivedPackageUnsigned:true,images:manifests};
  const receiptFile=path.join(path.dirname(archive),'package-receipt.json');
  fs.writeFileSync(receiptFile,JSON.stringify(receipt,null,2)+'\n');
  return receiptFile;
}
