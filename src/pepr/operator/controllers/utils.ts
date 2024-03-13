import { V1OwnerReference } from "@kubernetes/client-node";
import { GenericKind } from "kubernetes-fluent-client";

/**
 * Sanitize a resource name to make it a valid Kubernetes resource name.
 *
 * @param name the name of the resource to sanitize
 * @returns the sanitized resource name
 */
export function sanitizeResourceName(name: string) {
  return (
    name
      // The name must be lowercase
      .toLowerCase()
      // Replace sequences of non-alphanumeric characters with a single '-'
      .replace(/[^a-z0-9]+/g, "-")
      // Truncate the name to 250 characters
      .slice(0, 250)
      // Remove leading and trailing non-letter characters
      .replace(/^[^a-z]+|[^a-z]+$/g, "")
  );
}

/**
 * Get the owner reference for a custom resource
 * @param cr the custom resource to get the owner reference for
 * @returns the owner reference for the custom resource
 */
export function getOwnerRef(cr: GenericKind): V1OwnerReference[] {
  const { name, uid } = cr.metadata!;

  return [
    {
      apiVersion: cr.apiVersion!,
      kind: cr.kind!,
      uid: uid!,
      name: name!,
    },
  ];
}
