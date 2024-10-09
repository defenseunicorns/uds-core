// SPDX-License-Identifier: AGPL-3.0-or-later OR Commercial
import { Capability } from "pepr";

export const operator = new Capability({
  name: "uds-core-operator",
  description: "The UDS Operator is responsible for managing the lifecycle of UDS resources",
});

export const { Store, When } = operator;
