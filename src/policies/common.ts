import { Capability, PeprValidateRequest, a } from "pepr";

export const policies = new Capability({
  name: "uds-core-policies",
  description:
    "Collection of core validation policies for Pods, ConfigMaps, and other Kubernetes resources.",
});

export const { Store, When } = policies;

// Returns all volumes in the pod
export function volumes(request: PeprValidateRequest<a.Pod>) {
  return request.Raw.spec?.volumes || [];
}

// Returns all containers in the pod
export function containers(request: PeprValidateRequest<a.Pod>) {
  return [
    ...(request.Raw.spec?.containers || []),
    ...(request.Raw.spec?.initContainers || []),
    ...(request.Raw.spec?.ephemeralContainers || []),
  ];
}
