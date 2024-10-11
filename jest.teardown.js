/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

const { K8s, kind } = require("kubernetes-fluent-client");

module.exports = async () => {
  await K8s(kind.Namespace).Delete("policy-tests");
}
