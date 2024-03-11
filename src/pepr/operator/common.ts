import { GenericKind } from "kubernetes-fluent-client";
import { Capability, K8s, Log } from "pepr";

// Register the CRD
import { ExemptStatus, PkgStatus, UDSExemption, UDSPackage } from "./crd";
import "./crd/register";

export const operator = new Capability({
  name: "uds-core-operator",
  description: "The UDS Operator is responsible for managing the lifecycle of UDS resources",
});

export const { Store, When } = operator;

/**
 * Updates the status of the package
 *
 * @param cr The custom resource to update
 * @param status The new status
 */
export async function updateStatus(cr: GenericKind, status: PkgStatus | ExemptStatus) {
  const model = cr.kind === "Package" ? UDSPackage : UDSExemption;
  Log.debug(cr.metadata, `Updating status to ${status.phase}`);
  await K8s(model).PatchStatus({
    metadata: {
      name: cr.metadata!.name,
      namespace: cr.metadata!.namespace,
    },
    status,
  });
}
