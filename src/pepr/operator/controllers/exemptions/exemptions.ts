import { policies } from '../../../policies/index';
import { UDSExemption } from '../../crd';

export async function addExemptions(exmpt: UDSExemption) {
    const {Store} = policies;
    exmpt.spec?.exemptions?.forEach((e) => {
        if(!e.policyName) return false;
        // const exemption = registerExemptions([{namespace: e.matcher.namespace, name: e.matcher.name}])
      const exemptionsStr = Store.getItem(e.policyName);
      if (!exemptionsStr) {
        return false;
      } 
      const exemptionArr = JSON.parse(exemptionsStr);
      exemptionArr.push({namespace: e.matcher.namespace, name: e.matcher.name})
      Store.setItem(e.policyName, JSON.stringify(exemptionArr))
    })
}
