import { registerExemptions } from '../../../policies/exemptions';
import { policies } from '../../../policies/index';
import { UDSExemption } from '../../crd';

export async function addExemptions(expt: UDSExemption) {
    const {Store} = policies;
    const key = expt.spec?.exemptions![0].policyName
    if(!key) return false;
    const exemption = registerExemptions([{namespace: expt.spec?.exemptions![0].matcher.namespace, name: expt.spec?.exemptions![0].matcher.name}])
}
