// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import yaml from 'js-yaml';

const root=path.resolve(import.meta.dirname,'../..');
const out=path.join(import.meta.dirname,'.build');
const args=process.argv.slice(2);
const option=(name,fallback)=>{const i=args.indexOf(name);return i<0?fallback:args[i+1];};
const uds=option('--uds',process.env.UDS_CLI||'uds');
const promtool=option('--promtool',process.env.PROMTOOL||'promtool');
const run=(argv)=>execFileSync(uds,['zarf','tools','helm','template',...argv],{cwd:root,encoding:'utf8'});
fs.mkdirSync(out,{recursive:true});
const operatorChart=path.join(out,'observability-chart');
fs.rmSync(operatorChart,{recursive:true,force:true});
fs.cpSync(path.join(root,'src/pepr/uds-operator-config'),operatorChart,{recursive:true});
fs.copyFileSync(path.join(import.meta.dirname,'chart/templates/uptime-capability-aliases.yaml'),path.join(operatorChart,'templates/uptime-recording-rules.yaml'));
const controller=run(['uds-controller','src/go-controller/chart','--namespace','uds-system','--api-versions','monitoring.coreos.com/v1','--kube-version','1.37.1']);
const operator=run(['uds-operator-config',operatorChart,'--namespace','pepr-system','--api-versions','monitoring.coreos.com/v1','--set','operator.AUTHSERVICE_REDIS_URI=,cluster.caBundle.certs=,cluster.caBundle.includeDoDCerts=false,cluster.caBundle.includePublicCerts=false,cluster.policy.allowAllNsExemptions=false,cluster.expose.domain=uds.dev,cluster.expose.adminDomain=admin.uds.dev']);
const docs=[controller,operator].flatMap(text=>yaml.loadAll(text,null,{json:true}));
const rules=docs.filter(o=>o?.kind==='PrometheusRule'&&['uds-native-controller-capabilities','uds-pepr-uptime'].includes(o.metadata.name));
if(rules.length!==2)throw new Error('Native and compatibility rule templates did not render');
const records=rules.flatMap(o=>o.spec.groups.flatMap(g=>g.rules));
if(new Set(records.map(r=>r.record)).size!==4)throw new Error('Duplicate or missing capability records');
for(const record of records.filter(r=>r.record.startsWith('uds:pepr_'))){
 if(record.labels.implementation!=='go-native'||record.labels.compatibility_alias!=='true'||!record.labels.metric_semantics)throw new Error('Legacy alias hides its native implementation');
 if(/pepr-uds-core|deployment:up/.test(record.expr))throw new Error('Legacy alias still claims Pepr process availability');
}
fs.writeFileSync(path.join(out,'uptime-rules.yaml'),yaml.dump({groups:rules.flatMap(o=>o.spec.groups)}));
execFileSync(promtool,['test','rules',path.join(import.meta.dirname,'tests/uptime.test.yaml')],{cwd:root,stdio:'inherit'});
fs.writeFileSync(path.join(out,'observability-validation.json'),JSON.stringify({engine:'actual Prometheus promtool',renderedRecords:records.map(r=>r.record),scenarios:8,assertions:32,legacyAliasesExplicit:true,peprProcessClaims:false},null,2)+'\n');
