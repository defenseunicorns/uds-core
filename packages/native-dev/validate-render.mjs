// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
import yaml from 'js-yaml';

export function privateGatewayServices(objects) {
  const gateways=['admin','tenant'].map(role=>{
    const service=objects.find(o=>o?.kind==='Service'&&o.metadata?.namespace===`istio-${role}-gateway`&&o.metadata?.name===`${role}-ingressgateway`);
    if(!service||service.spec.type!=='ClusterIP')throw new Error(`Private ${role} gateway must render as its own ClusterIP Service`);
    const ports=new Set(service.spec.ports.map(p=>p.port));
    if(!ports.has(80)||!ports.has(443)||!Object.keys(service.spec.selector||{}).length)throw new Error('Private gateway lost its real HTTP/TLS listener or workload selector');
    return {role,name:service.metadata.name,namespace:service.metadata.namespace,type:service.spec.type,ports:[...ports].sort((a,b)=>a-b),selector:service.spec.selector};
  });
  if(JSON.stringify(gateways[0].selector)===JSON.stringify(gateways[1].selector))throw new Error('Admin and tenant gateway workload roles were combined');
  return gateways;
}

export function controllerRequestBudgets(controllers) {
  return controllers.map(controller=>{
    const container=controller.spec.template.spec.containers.find(c=>c.name==='controller');
    if(JSON.stringify(container.args)!==JSON.stringify(['--kube-api-qps=100','--kube-api-burst=200']))throw new Error('Native development controller lost its qualified shared request budget');
    if(container.resources.limits.cpu!=='100m'||container.resources.limits.memory!=='128Mi')throw new Error('Controller resource limits changed without a measured checkpoint');
    return {qps:100,burst:200,cpu:container.resources.limits.cpu,memory:container.resources.limits.memory};
  });
}

export function nativeIdentityAuthority(objects, bridge) {
  if (bridge.coreAudiencePairsEnabled !== true || bridge.operatorNamespace !== 'uds-system' || bridge.operatorServiceAccount !== 'uds-controller') {
    throw new Error('Combined identity requires explicit paired authority and the exact native controller principal');
  }
  const role = objects.find(o => o.kind === 'Role' && o.metadata.name === 'uds-native-controller-bound-identity' && o.metadata.namespace === 'uds-system');
  const expectedRules = [
    { apiGroups: [''], resources: ['serviceaccounts'], resourceNames: ['uds-controller'], verbs: ['get'] },
    { apiGroups: [''], resources: ['pods'], verbs: ['get'] },
  ];
  if (!role || JSON.stringify(role.rules) !== JSON.stringify(expectedRules)) throw new Error('Combined identity lost its exact bound-controller read role');
  const binding = objects.find(o => o.kind === 'RoleBinding' && o.metadata.name === 'uds-native-controller-bound-identity' && o.metadata.namespace === 'uds-system');
  const expectedRef = { apiGroup: 'rbac.authorization.k8s.io', kind: 'Role', name: 'uds-native-controller-bound-identity' };
  const expectedSubjects = [{ kind: 'ServiceAccount', name: 'uds-native-identity', namespace: 'keycloak' }];
  if (!binding || JSON.stringify(binding.roleRef) !== JSON.stringify(expectedRef) || JSON.stringify(binding.subjects) !== JSON.stringify(expectedSubjects)) throw new Error('Combined identity lost its exact bound-controller role binding');
  return { coreAudiencePairsEnabled: true, operatorNamespace: bridge.operatorNamespace, operatorServiceAccount: bridge.operatorServiceAccount };
}

export function validateRender(source,identityIncluded) {
  // Original gateway templates repeat the app/istio labels. Match the Helm
  // YAML-to-JSON conversion while preserving the original signed chart bytes.
  const objects=yaml.loadAll(source,null,{json:true}).filter(o=>o?.kind);
  const runtime=objects.filter(o=>['Deployment','DaemonSet','StatefulSet','Pod'].includes(o.kind)).map(o=>({kind:o.kind,name:o.metadata.name,namespace:o.metadata.namespace,images:(o.kind==='Pod'?o.spec:o.spec.template.spec).containers.map(c=>c.image)}));
  if(runtime.some(o=>o.images.some(i=>i.includes('###'))))throw new Error('Runtime image still contains an unresolved package template');
  if(runtime.some(o=>o.images.some(i=>/pepr|keycloak:|identity-config:/.test(i))))throw new Error('Excluded legacy runtime remains in native manifests');
  const controllers=objects.filter(o=>o.kind==='Deployment'&&o.metadata.name==='uds-controller');
  if(controllers.length!==4)throw new Error('Expected exactly four native controller installation phases');
  const controllerBudgets=controllerRequestBudgets(controllers);
  const controllerImages=controllers.map(o=>o.spec.template.spec.containers.find(c=>c.name==='controller').image);
  if(new Set(controllerImages).size!==1||!controllerImages[0].startsWith('docker.io/library/uds-core-native-controller:'))throw new Error('Every native controller phase must use the same chosen derivative image');
  const configs=objects.filter(o=>['MutatingWebhookConfiguration','ValidatingWebhookConfiguration'].includes(o.kind)&&o.metadata.name.startsWith('uds-controller-'));
  if(configs.length!==15)throw new Error('Complete callbacks must occur only in registration, active and narrowed phases');
  const callbacks=configs.reduce((total,config)=>total+config.webhooks.length,0);
  if(callbacks!==27)throw new Error('Expected nine complete callback entries in each of three registered phases');
  for(const config of configs)for(const hook of config.webhooks)if(hook.failurePolicy!=='Fail'||!hook.clientConfig.caBundle)throw new Error('Callback registration lost fail-closed shared trust');
  const bindings=objects.filter(o=>o.kind.endsWith('AdmissionPolicyBinding')&&o.metadata.name.startsWith('uds-native-'));
  if(bindings.length!==28)throw new Error('Wrong native activation binding counts');
  let identityPasswordOnly=false;
  let identityAuthority;
  let privateGateways=[];
  const secret=objects.find(o=>o.kind==='Secret'&&o.metadata.name==='uds-native-identity-config');
  if(identityIncluded){
    if(!secret)throw new Error('Native development identity configuration missing');
    const bridge=JSON.parse(secret.stringData['bridge.json']);
    if(bridge.passwordOnly!==true)throw new Error('Identity password-only contract omitted');
    identityAuthority=nativeIdentityAuthority(objects,bridge);
    const stateful=objects.find(o=>o.kind==='StatefulSet'&&o.metadata.namespace==='keycloak');
    if(stateful.spec.replicas!==1||stateful.spec.template.spec.serviceAccountName!=='uds-native-identity')throw new Error('Unqualified identity replica or authority topology');
    const dex=stateful.spec.template.spec.containers.filter(c=>c.name.startsWith('dex-'));
    const namespaces=dex.map(c=>c.env.find(e=>e.name==='KUBERNETES_POD_NAMESPACE')?.value);
    if(dex.length!==2||namespaces.some(n=>!n)||new Set(namespaces).size!==2)throw new Error('Public and admin Dex storage authority was combined');
    identityPasswordOnly=true;
    privateGateways=privateGatewayServices(objects);
  }else if(secret||runtime.some(o=>['keycloak','authservice','istio-admin-gateway','istio-tenant-gateway'].includes(o.namespace)))throw new Error('Identity or public gateways leaked into fenced native base');
  return {objects:objects.length,runtime,controllerPhases:controllers.length,controllerRequestBudgets:controllerBudgets,completeCallbackRegistrations:configs.length,completeCallbackEntries:callbacks,nativeBindingsByName:Object.fromEntries([...new Set(bindings.map(o=>o.metadata.name))].map(name=>[name,bindings.filter(o=>o.metadata.name===name).length])),identityPasswordOnly,identityAuthority,controllerImages,privateGateways,yamlDuplicateHandling:'Inherited original gateway labels use Helm JSON last-value behavior; signed source templates preserved'};
}
