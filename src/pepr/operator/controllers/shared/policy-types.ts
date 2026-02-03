/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { Matcher, Policy, UDSExemption } from "../../crd";

export type StoredMatcher = Matcher & { owner: string };
export type PolicyMap = Map<Policy, StoredMatcher[]>;
export type PolicyOwnerMap = Map<string, UDSExemption>;
