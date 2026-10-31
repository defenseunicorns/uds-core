// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import yaml from 'js-yaml';

const sha=data=>crypto.createHash('sha256').update(data).digest('hex');

export function verifySignedInputs({inputs,out,run,uds,directory,required,baseOnly}) {
  if (!directory&&!required) return {status:'not-requested',packages:[],charts:{}};
  const home=directory?path.resolve(directory):path.join(out,'signed-inputs','archives');
  fs.mkdirSync(home,{recursive:true});
  const verified={status:'verified',packages:[],charts:{}};
  const flags=['--verify=always','--certificate-identity',inputs.core.signatureIdentity,'--certificate-oidc-issuer',inputs.core.signatureIssuer,'--no-color','--cache',path.join(out,'zarf-cache'),'--tmpdir',path.join(out,'zarf-tmp')];
  for (const expected of inputs.signedPackages) {
    if(baseOnly&&expected.name==='core-identity-authorization')continue;
    const archive=path.join(home,expected.filename);
    if (!fs.existsSync(archive)) {
      if (directory) throw new Error(`Missing signed Core input ${archive}`);
      run(uds,['zarf','package','pull',expected.source,'--output-directory',home,...flags],{stdio:'inherit'});
    }
    const digest=sha(fs.readFileSync(archive));
    if (digest!==expected.sha256) throw new Error(`Signed archive digest changed: ${expected.filename}`);
    const definition=yaml.load(run(uds,['zarf','package','inspect','definition',archive,...flags]));
    if (definition.metadata.name!==expected.name||definition.metadata.version!==inputs.core.version) throw new Error('Signed original package identity changed');
    const target=path.join(out,'signed-inputs',expected.name);
    fs.mkdirSync(target,{recursive:true});
    const components=definition.components.filter(c=>expected.components.includes(c.name));
    run('tar',['--zstd','-xf',archive,'-C',target,...components.map(c=>`components/${c.name}.tar`),'images/index.json']);
    const images=JSON.parse(fs.readFileSync(path.join(target,'images/index.json'))).manifests;
    const receipt={name:expected.name,archiveSHA256:digest,signatureIdentity:inputs.core.signatureIdentity,signatureIssuer:inputs.core.signatureIssuer,images,charts:{}};
    for (const component of components) {
      const archive=path.join(target,'components',`${component.name}.tar`);
      run('tar',['-xf',archive,'-C',target]);
      for (const chart of component.charts||[]) {
        const filename=path.join(target,component.name,'charts',`${chart.name}-${chart.version}.tgz`);
        if (!fs.existsSync(filename)) throw new Error(`Signed original chart missing: ${component.name}/${chart.name}`);
        const key=`${component.name}/${chart.name}`;
        verified.charts[key]=filename;
        receipt.charts[key]=sha(fs.readFileSync(filename));
      }
    }
    verified.packages.push(receipt);
  }
  return verified;
}

export function retainSignedRemoteCharts(component,charts) {
  for (const chart of component.charts||[]) {
    if (!chart.url) continue;
    const archive=charts[`${component.name}/${chart.name}`];
    if (!archive) throw new Error(`Signed original remote chart unavailable: ${component.name}/${chart.name}`);
    if (path.basename(archive)!==`${chart.name}-${chart.version}.tgz`) {
      throw new Error(`Signed chart version differs from source: ${component.name}/${chart.name}@${chart.version}`);
    }
    chart.localPath=archive;
    delete chart.url;
  }
}
