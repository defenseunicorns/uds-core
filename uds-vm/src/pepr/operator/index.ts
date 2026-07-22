/**
 * Copyright 2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

// CRD imports
import { VirtualMachine as KubevirtVirtualMachine } from "./crd/kubevirt/virtualmachine-v1.js";
import { Package } from "./crd/package-v1alpha1.js";

import { mutateVirtualMachine } from "./controllers/kubevirt/vm-mutation.js";
import { handlePackage, handlePackageDelete } from "./controllers/kubevirt/namespace.js";

export { kubevirt } from "./common.js";

import { When } from "./common.js";

// Watch for Package CRs to translate kubevirt.enabled into namespace label
When(Package)
  .IsCreatedOrUpdated()
  .Reconcile((pkg: Package) => handlePackage(pkg))
  .Finalize((pkg: Package) => handlePackageDelete(pkg));

When(KubevirtVirtualMachine)
  .IsCreatedOrUpdated()
  .Mutate((vm: KubevirtVirtualMachine) => mutateVirtualMachine(vm));
