/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { K8s, kind } from 'pepr';

export default async () => {
  await K8s(kind.Namespace).Delete("policy-tests");
}
