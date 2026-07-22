/**
 * Copyright 2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

export const KUBEVIRT_LABEL = "uds.dev/kubevirt-workload";
export const KUBEVIRT_PKG_ANNOTATION_PREFIX = "uds.dev/kubevirt-pkg-";
export const PRIVATE_REGISTRY_SECRET = "private-registry";
export const PRIVATE_REGISTRY_SECRET_TYPE = "kubernetes.io/dockerconfigjson";
export const SOURCE_NAMESPACE_CANDIDATES = ["pepr-system", "zarf", "uds-crds"];
