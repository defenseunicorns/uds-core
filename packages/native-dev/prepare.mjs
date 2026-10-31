// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { isDeepStrictEqual } from 'node:util';
import yaml from 'js-yaml';
import { verifySignedInputs, retainSignedRemoteCharts } from './signed-inputs.mjs';
import { verifyPackage } from './verify-package.mjs';
import { validateRender } from './validate-render.mjs';
import { verifyControllerReuse, verifyLocalController } from './reuse-controller.mjs';
import { controllerImageTag, frozenControllerTag } from './image-tag.mjs';
import { zarfDockerEnvironment } from './zarf-docker-api.mjs';
import { verifyIdentitySource } from './identity-source.mjs';
import { consumeIdentityBuildReceipt } from './identity-receipt.mjs';

const root=path.resolve(import.meta.dirname,'../..');
const pkg=import.meta.dirname;
const out=path.join(pkg,'.build');
const inputs=JSON.parse(fs.readFileSync(path.join(pkg,'inputs.lock.json')));
const args=process.argv.slice(2);
const option=(name,fallback)=>{const i=args.indexOf(name);return i<0?fallback:args[i+1];};
const uds=option('--uds',process.env.UDS_CLI||'uds');
const go=option('--go',process.env.GO_BINARY||'go');
const docker=option('--docker',process.env.DOCKER_BINARY||'docker');
const arch=option('--arch','amd64');
const renderOnly=args.includes('--render-only');
const baseOnly=args.includes('--base');
const connected=args.includes('--connected');
if(renderOnly&&args.includes('--package'))throw new Error('Use --render with --package, or --render-only for a build without image/package creation');
const sha=data=>crypto.createHash('sha256').update(data).digest('hex');
const run=(cmd,argv,options={})=>execFileSync(cmd,argv,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','inherit'],...options});
const version=run(go,['version']);if(!version.includes(inputs.go+' '))throw new Error(`Pinned ${inputs.go} required; found ${version.trim()}`);
if(arch!==inputs.architecture)throw new Error(`This frozen native development input lock supports ${inputs.architecture} only`);
fs.mkdirSync(out,{recursive:true});
// Keep tool state inside this build, including restricted/read-only homes.
for(const [name,directory] of [['HELM_CACHE_HOME','helm-cache'],['HELM_CONFIG_HOME','helm-config'],['HELM_DATA_HOME','helm-data'],['XDG_STATE_HOME','xdg-state']]){
 if(!process.env[name])process.env[name]=path.join(out,directory);
 fs.mkdirSync(process.env[name],{recursive:true});
}

function walk(dir,files=[]){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){if(['node_modules','.git','.build','build','vendor','__pycache__'].includes(entry.name))continue;const name=path.join(dir,entry.name);if(entry.isDirectory())walk(name,files);else files.push(name);}return files;}
function sourceHashes(){const files={};for(const directory of ['src/go-controller','src/dev-identity','src/pepr','src/istio','src/keycloak','src/authservice','src/prometheus-stack','packages/base','packages/identity-authorization','packages/native-dev'])for(const name of walk(path.join(root,directory)))files[path.relative(root,name)]=sha(fs.readFileSync(name));for(const name of ['docs/dev/development-identity.md']){const filename=path.join(root,name);if(fs.existsSync(filename))files[name]=sha(fs.readFileSync(filename));}return files;}
const identityReceiptPath=option('--identity-build-receipt');
if(args.includes('--identity-build-receipt')&&!identityReceiptPath)throw new Error('--identity-build-receipt requires an absolute receipt file');
if(baseOnly&&identityReceiptPath)throw new Error('The base profile does not include identity; omit --identity-build-receipt');
let identityBuildReceipt;
if(identityReceiptPath){
 const selection=consumeIdentityBuildReceipt({root,go,docker,run,identity:inputs.identity,receiptPath:identityReceiptPath});
 inputs.identity=selection.identity;
 identityBuildReceipt=selection.provenance;
}
const sourceFiles=sourceHashes();
const commit=run('git',['rev-parse','HEAD']).trim();
try{run('git',['merge-base','--is-ancestor',inputs.core.sourceCommit,commit]);}
catch{throw new Error('Native recipe requires its pinned Core source commit in the checkout history');}
const sourceSHA=sha(JSON.stringify(Object.entries(sourceFiles).sort(([a],[b])=>a.localeCompare(b))));
const lock={...inputs,architecture:arch,sourceGitHEAD:commit,sourceSHA256:sourceSHA,sourceFiles,removedImportActions:[],createdAt:null};
if(!baseOnly)verifyIdentitySource({root,go,run,identity:inputs.identity});
if(identityBuildReceipt)lock.identityBuildReceipt=identityBuildReceipt;
lock.componentSourceSHA256=Object.fromEntries([['controller','src/go-controller/'],['identity','src/dev-identity/'],['composition','packages/native-dev/']].map(([name,prefix])=>[name,sha(JSON.stringify(Object.entries(sourceFiles).filter(([filename])=>filename.startsWith(prefix)).sort(([a],[b])=>a.localeCompare(b))))]));
lock.tenantActivationEnabled=!baseOnly&&!args.includes('--candidate');
lock.connectedOnly=connected;
lock.zarfCreateEnvironment={DOCKER_API_VERSION:inputs.zarfDockerAPIVersion};
const controllerBudgetPath=path.join(pkg,'values/controller-budget.yaml');
const controllerBudget=yaml.load(fs.readFileSync(controllerBudgetPath,'utf8')).kubernetesAPI;
lock.controllerRequestBudget={generalDefaults:{qps:20,burst:40},nativeDevelopmentOverride:controllerBudget,valuesPath:'packages/native-dev/values/controller-budget.yaml',sha256:sha(fs.readFileSync(controllerBudgetPath)),sharedFor:['typed','dynamic','UDS'],cpuLimit:'100m',memoryLimit:'128Mi'};
const signed=verifySignedInputs({inputs,out,run,uds,directory:option('--signed-input-dir',process.env.NATIVE_SIGNED_INPUT_DIR),required:args.includes('--package'),baseOnly});
lock.signedInputVerification={status:signed.status,packages:signed.packages};
lock.derivedPackageUnsigned=true;
lock.sourceDateEpoch=run('git',['show','-s','--format=%ct',inputs.core.sourceCommit]).trim();
const nativePolicies=JSON.parse(fs.readFileSync(path.join(root,'src/go-controller/chart/files/native-admission/policies.json'))).items;
lock.admissionBindings=nativePolicies.filter(o=>o.kind.endsWith('PolicyBinding')).map(o=>({kind:o.kind,name:o.metadata.name,spec:o.spec}));
const mutationBootstrap=nativePolicies.filter(o=>['MutatingAdmissionPolicy','MutatingAdmissionPolicyBinding'].includes(o.kind)).map(o=>({...o,metadata:{...o.metadata,labels:{...(o.metadata.labels||{}),'app.kubernetes.io/managed-by':'Helm'},annotations:{...(o.metadata.annotations||{}),'meta.helm.sh/release-name':'uds-controller','meta.helm.sh/release-namespace':'uds-system'}}}));
fs.writeFileSync(path.join(out,'native-mutation-bootstrap.json'),JSON.stringify({apiVersion:'v1',kind:'List',items:mutationBootstrap},null,2)+'\n');
const cliOptions=['--flavor','upstream','--no-color','--cache',path.join(out,'zarf-cache'),'--tmpdir',path.join(out,'zarf-tmp')];
const composed=name=>yaml.load(run(uds,['zarf','dev','inspect','definition',path.join(root,name),...cliOptions]));
function rewritePaths(component,origin,target){
 const relative=value=>path.relative(target,path.resolve(origin,value));
 for(const chart of component.charts||[]){if(chart.localPath)chart.localPath=relative(chart.localPath);for(const field of ['valuesFiles','templatedValuesFiles'])if(chart[field])chart[field]=chart[field].map(relative);}
 for(const file of component.files||[])file.source=relative(file.source);
 for(const manifest of component.manifests||[])if(manifest.files)manifest.files=manifest.files.map(relative);
}
function overlay(name,definition,components,origin){
 const target=path.join(out,'imports',name);fs.mkdirSync(target,{recursive:true});
 for(const component of components)rewritePaths(component,origin,target);
 const result={kind:'ZarfPackageConfig',metadata:{name:`native-dev-${name}-overlay`,version:inputs.core.version},variables:definition.variables,components};
 fs.writeFileSync(path.join(target,'zarf.yaml'),'# Generated from pinned original Core component definitions; see build-lock.json.\n'+yaml.dump(result,{noRefs:true,lineWidth:120}));
}
const istio=composed('src/istio');
const control=istio.components.find(c=>c.name==='istio-controlplane');if(!control)throw new Error('Original Istio controlplane component missing');
if(signed.status==='verified')retainSignedRemoteCharts(control,signed.charts);
if(connected){
 const pilot=control.charts.find(c=>c.name==='istiod');
 const values=path.join(pkg,'values/istiod-connected.yaml');
 pilot.valuesFiles.push(values);
 lock.connectedOverrides=[{component:'istio-controlplane',chart:'istiod',sourcePath:'src/istio/values/upstream/istiod.yaml',valuesPath:'packages/native-dev/values/istiod-connected.yaml',sha256:sha(fs.readFileSync(values)),image:'docker.io/istio/proxyv2:1.31.2-distroless',reason:'An empty connected-mode Zarf registry otherwise produces /istio/proxyv2, which the Kubernetes runtime cannot pull'}];
}
const removedNames=['Wait for Pepr Ambient enrollment','Verify Pepr admission readiness'];
const originalActions=control.actions?.onDeploy?.after||[];
for(const name of removedNames){const action=originalActions.find(a=>a.description===name);if(!action)throw new Error(`Expected pinned Pepr-dependent action missing: ${name}`);lock.removedImportActions.push({component:'istio-controlplane',action,sha256:sha(JSON.stringify(action))});}
control.actions.onDeploy.after=originalActions.filter(a=>!removedNames.includes(a.description));
control.actions.onDeploy.after.push({description:'Require CNI, ztunnel and Istiod before native ambient controller',maxTotalSeconds:300,cmd:'set -eu\n./zarf tools kubectl -n istio-system rollout status daemonset/istio-cni-node --timeout=120s\n./zarf tools kubectl -n istio-system rollout status daemonset/ztunnel --timeout=120s\n./zarf tools kubectl -n istio-system rollout status deployment/istiod --timeout=120s\n'});
const gateways=istio.components.filter(c=>['istio-admin-gateway','istio-tenant-gateway'].includes(c.name));
if(signed.status==='verified')for(const gateway of gateways)retainSignedRemoteCharts(gateway,signed.charts);
const gatewayPrivateValues=path.join(pkg,'values/gateway-private.yaml');
lock.privateGatewayOverlay={profile:'private-development-guest',serviceType:'ClusterIP',valuesPath:'packages/native-dev/values/gateway-private.yaml',sha256:sha(fs.readFileSync(gatewayPrivateValues)),components:gateways.map(c=>c.name),accessBoundary:'Hosted access requires a separate UID-bound authenticated outer broker, not implemented by this recipe; explicit owned test relays can qualify inner TLS/SSO only; LoadBalancer provisioning is not qualified',comparison:'Original stock control uses the same ClusterIP gateway values'};
for(const gateway of gateways){const chart=gateway.charts.find(c=>c.name==='gateway');if(!chart)throw new Error('Original gateway chart missing');chart.valuesFiles.push(gatewayPrivateValues);}
overlay('istio',istio,[control,...gateways],path.join(root,'src/istio'));
const identity=composed('src/keycloak');
const provider=identity.components.find(c=>c.name==='keycloak');if(!provider)throw new Error('Original Keycloak component missing');
lock.omittedImages=provider.images;
provider.images=[inputs.identity.bridgeImage,inputs.identity.dexImage];
const nativeValues=path.join(pkg,'values/identity-password-only.yaml');
provider.charts.find(c=>c.name==='keycloak').valuesFiles ||= [];
provider.charts.find(c=>c.name==='keycloak').valuesFiles.push(path.relative(path.join(root,'src/keycloak'),nativeValues));
if(identityBuildReceipt){
 const imageValues=path.join(out,'identity-images.yaml');
 fs.writeFileSync(imageValues,yaml.dump({nativeIdentity:{bridgeImage:inputs.identity.bridgeImage,dexImage:inputs.identity.dexImage}}));
 provider.charts.find(c=>c.name==='keycloak').valuesFiles.push(path.relative(path.join(root,'src/keycloak'),imageValues));
}

overlay('identity',identity,[provider],path.join(root,'src/keycloak'));
// Reuse the original non-runtime component declarations without requiring an unused Pepr dist build.
const pepr=yaml.load(fs.readFileSync(path.join(root,'src/pepr/zarf.yaml'),'utf8'));
const operator=pepr.components.find(c=>c.name==='uds-operator-config');
const operatorChart=operator.charts.find(c=>c.name==='uds-operator-config');
const chartSource=path.join(root,'src/pepr/uds-operator-config');
const chartTarget=path.join(out,'imports','operator-config','chart');
fs.rmSync(chartTarget,{recursive:true,force:true});fs.cpSync(chartSource,chartTarget,{recursive:true});
const template='templates/uptime-recording-rules.yaml';
const aliasSource=path.join(pkg,'chart/templates/uptime-capability-aliases.yaml');
lock.capabilityAliasOverlay={originalTemplate:'src/pepr/uds-operator-config/'+template,originalSHA256:sha(fs.readFileSync(path.join(chartSource,template))),replacementTemplate:'packages/native-dev/chart/templates/uptime-capability-aliases.yaml',replacementSHA256:sha(fs.readFileSync(aliasSource)),semantics:'Legacy Pepr-named records transparently alias actual native admission/reconciliation capability; no Pepr process health is fabricated'};
fs.copyFileSync(aliasSource,path.join(chartTarget,template));
operatorChart.localPath=chartTarget;
overlay('operator-config',pepr,[operator],path.join(root,'src/pepr'));

const binaries=path.join(out,'controller-image');fs.mkdirSync(binaries,{recursive:true});
const env={...process.env,GOWORK:'off',CGO_ENABLED:'0',GOOS:'linux',GOARCH:arch,GOFLAGS:'-buildvcs=false'};
run(go,['build','-trimpath','-ldflags=-s -w -buildid=','-o',path.join(binaries,'uds-controller'),'.'],{cwd:path.join(root,'src/go-controller'),env});
const helperFiles=fs.readdirSync(path.join(pkg,'scripts')).filter(name=>name.endsWith('.go')&&!name.endsWith('_test.go')).map(name=>path.join(pkg,'scripts',name));
run(go,['build','-trimpath','-ldflags=-s -w -buildid=','-o',path.join(out,'native-dev-bootstrap'),...helperFiles],{env:{...env,GOARCH:run(go,['env','GOHOSTARCH']).trim(),GOOS:run(go,['env','GOHOSTOS']).trim()}});
lock.controllerBinarySHA256=sha(fs.readFileSync(path.join(binaries,'uds-controller')));
lock.bootstrapBinarySHA256=sha(fs.readFileSync(path.join(out,'native-dev-bootstrap')));
let tag=controllerImageTag(lock.controllerBinarySHA256,sourceSHA);
lock.controllerImage=`docker.io/library/uds-core-native-controller:${tag}`;
fs.copyFileSync(path.join(root,'src/go-controller/Dockerfile'),path.join(binaries,'Dockerfile'));
const receiptPath=option('--controller-image-receipt');
let frozenController;
if(receiptPath){
 if(!path.isAbsolute(receiptPath))throw new Error('Frozen controller receipt must use an explicit absolute path');
 const receipt=JSON.parse(fs.readFileSync(receiptPath));
 tag=frozenControllerTag(receipt.controllerImage);
 lock.controllerImage=receipt.controllerImage;
 frozenController=verifyControllerReuse(receipt,lock);
 lock.controllerImageID=frozenController.imageID;
 lock.controllerImageSourceSHA256=frozenController.sourceSHA256;
 lock.controllerImageReuseReceipt={path:receiptPath,sha256:sha(fs.readFileSync(receiptPath)),reason:'Packaging/helper-only changes retain the qualified immutable controller image'};
}
if(!renderOnly){
 if(!frozenController)run(docker,['build','--pull=false','--provenance=false','--build-arg',`SOURCE_DATE_EPOCH=${lock.sourceDateEpoch}`,'--build-arg',`DISTROLESS_IMAGE=${inputs.distroless}`,'--build-arg',`SOURCE_SHA256=${sourceSHA}`,'--build-arg',`BINARY_SHA256=${lock.controllerBinarySHA256}`,'-t',lock.controllerImage,binaries],{stdio:'inherit'});
 const image=JSON.parse(run(docker,['image','inspect',lock.controllerImage]))[0];
 if(frozenController)verifyLocalController(image,frozenController,lock.controllerBinarySHA256);
 lock.controllerImageID=image.Id;
 if(!baseOnly)for(const [image,expected] of [[inputs.identity.bridgeImage,inputs.identity.bridgeImageID],[inputs.identity.dexImage,inputs.identity.dexImageID]]){const actual=JSON.parse(run(docker,['image','inspect',image]))[0].Id;if(actual!==expected)throw new Error(`Identity image differs from frozen input: ${image}`);}
}
fs.writeFileSync(path.join(out,'controller-image.yaml'),yaml.dump({image:{repository:'docker.io/library/uds-core-native-controller',tag,pullPolicy:'IfNotPresent'}}));
const set=`NATIVE_CONTROLLER_IMAGE=${lock.controllerImage},NATIVE_CONTROLLER_REPOSITORY=docker.io/library/uds-core-native-controller,NATIVE_CONTROLLER_TAG=${tag}`;
lock.zarfCreateArguments=['zarf','package','create',pkg,'--flavor','upstream','--architecture',arch,'--set',set,'--output',path.join(pkg,'build'),'--confirm','--cache',path.join(out,'zarf-cache'),'--tmpdir',path.join(out,'zarf-tmp')];
fs.writeFileSync(path.join(out,'build-lock.json'),JSON.stringify(lock,null,2)+'\n');
const assembly=path.join(out,'assembly');fs.mkdirSync(assembly,{recursive:true});
const main=yaml.load(fs.readFileSync(path.join(pkg,'zarf.yaml')));
if(connected)main.metadata.name+='-connected';
if(args.includes('--candidate'))main.metadata.name+='-candidate';
main.values.files=main.values.files.map(p=>path.relative(assembly,path.resolve(pkg,p)));
for(const component of main.components){
 if(component.import?.path)component.import.path=path.relative(assembly,path.resolve(pkg,component.import.path));
 rewritePaths(component,pkg,assembly);
}
if(baseOnly){
 main.metadata.name='core-native-dev-base';
 main.components=main.components.filter(c=>!['keycloak','authservice','istio-admin-gateway','istio-tenant-gateway'].includes(c.name));
 for(const component of main.components)for(const stage of ['before','after'])for(const action of component.actions?.onDeploy?.[stage]||[]){
  if(action.cmd?.includes('native-dev-bootstrap'))action.cmd=action.cmd.replace('--phase identity','--phase callbacks')+' --identity=false';
 }
}
fs.writeFileSync(path.join(assembly,'zarf.yaml'),yaml.dump(main,{noRefs:true,lineWidth:120}));
// The deployable assembly owns its values schema; rendering and package creation
// must validate the same contract rather than adding a CI-only schema later.
const valuesSchema=JSON.parse(run(uds,['zarf','dev','generate-schema',assembly,...cliOptions,'--set',set,'--delete-not-found'],{maxBuffer:32*1024*1024}));
valuesSchema.additionalProperties=false;
const valuesSchemaBytes=JSON.stringify(valuesSchema,null,2)+'\n';
fs.writeFileSync(path.join(assembly,'zarf-values.schema.json'),valuesSchemaBytes);
main.values.schema='zarf-values.schema.json';
lock.valuesSchemaSHA256=sha(valuesSchemaBytes);
fs.writeFileSync(path.join(assembly,'zarf.yaml'),yaml.dump(main,{noRefs:true,lineWidth:120}));
lock.identityIncluded=!baseOnly;
lock.zarfCreateArguments[3]=assembly;
const definition=run(uds,['zarf','dev','inspect','definition',assembly,...cliOptions,'--set',set]);fs.writeFileSync(path.join(out,'composed-zarf.yaml'),definition);
const parsed=yaml.load(definition);
const forbidden=parsed.components.filter(c=>c.name==='pepr-uds-core'||(c.images||[]).some(i=>/pepr|keycloak:|identity-config:/.test(i)));
if(forbidden.length)throw new Error('Native assembly still contains excluded Pepr or Keycloak runtime images');
if(renderOnly||args.includes('--render')){
 const deployVariables='DOMAIN=uds.dev,ADMIN_DOMAIN=admin.uds.dev,CA_BUNDLE_CERTS=,UDS_LOG_LEVEL=info,CNI_CONF_DIR=/var/lib/rancher/k3s/agent/etc/cni/net.d,CNI_BIN_DIR=/var/lib/rancher/k3s/data/cni';
 const manifests=run(uds,['zarf','dev','inspect','manifests',assembly,...cliOptions,'--create-set',set,'--deploy-set-variables',deployVariables,'--kube-version',option('--kube-version','1.37.1')],{maxBuffer:32*1024*1024});
 fs.writeFileSync(path.join(out,'rendered-manifests.yaml'),manifests);
 fs.writeFileSync(path.join(out,'render-validation.json'),JSON.stringify(validateRender(manifests,!baseOnly),null,2)+'\n');
}
if(sha(JSON.stringify(Object.entries(sourceHashes()).sort(([a],[b])=>a.localeCompare(b))))!==sourceSHA)throw new Error('Sources changed during preparation; rerun from a stable checkpoint');
fs.writeFileSync(path.join(out,'build-lock.json'),JSON.stringify(lock,null,2)+'\n');
let packageReceipt;
if(args.includes('--package')){
 run(uds,lock.zarfCreateArguments,{stdio:'inherit',env:zarfDockerEnvironment(inputs.zarfDockerAPIVersion,process.env)});
 const archive=path.join(pkg,'build',`zarf-package-${main.metadata.name}-${arch}-${main.metadata.version}-upstream.tar.zst`);
 packageReceipt=verifyPackage({archive,lock,expectedImages:parsed.components.flatMap(c=>c.images||[]),out,run});
 const imageArchive=path.join(pkg,'build',`${main.metadata.name}-${arch}-images.tar`);
 run('tar',['-cf',imageArchive,'-C',path.join(out,'package-verification','images'),'.']);
 const receipt=JSON.parse(fs.readFileSync(packageReceipt));
 const packagedSchema=fs.readFileSync(path.join(out,'package-verification','values.schema.json'));
 // Zarf normalizes schema JSON formatting when packaging; compare the contract
 // and retain the hashes of both actual encodings.
 if(!isDeepStrictEqual(JSON.parse(packagedSchema),valuesSchema))throw new Error('Packaged values schema differs from the prepared contract');
 receipt.valuesSchemaSHA256=sha(packagedSchema);
 receipt.preparedValuesSchemaSHA256=lock.valuesSchemaSHA256;
 receipt.ociPreloadArchive={path:imageArchive,sha256:sha(fs.readFileSync(imageArchive)),purpose:'Import into the explicitly owned Kubernetes node containerd before connected deployment; local native tags are intentionally unpublished'};
 fs.writeFileSync(packageReceipt,JSON.stringify(receipt,null,2)+'\n');
}
if(sha(JSON.stringify(Object.entries(sourceHashes()).sort(([a],[b])=>a.localeCompare(b))))!==sourceSHA)throw new Error('Sources changed during package creation; discard this artifact and rebuild from a stable checkpoint');
process.stdout.write(JSON.stringify({sourceSHA256:sourceSHA,controllerBinarySHA256:lock.controllerBinarySHA256,controllerImage:lock.controllerImage,components:parsed.components.map(c=>c.name),buildLock:path.join(out,'build-lock.json'),packageReceipt},null,2)+'\n');
