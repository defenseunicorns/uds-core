/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { K8s, kind } from 'pepr';

export async function setup() {
}

export async function teardown() {
  await K8s(kind.Namespace).Delete("trust-bundle-tests-1");
}
