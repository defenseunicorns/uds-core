/** Copyright 2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */
import { afterAll, expect, it } from "vitest";
import { writeFileSync } from "node:fs";
import { isExempt } from "../../../pepr/policies/exemptions";
import { ExemptionStore } from "../../../pepr/operator/controllers/exemptions/exemption-store";
import { MatcherKind, Policy } from "../../../pepr/operator/crd";
const cases: unknown[] = [];
const metadata = [
  { name: "assigned-one", generateName: "generated-" },
  { generateName: "generated-" },
  { name: "", generateName: "generated-" },
  { name: "assigned-one" },
  { name: "" },
  {},
  { name: "", generateName: "" },
];
for (const pattern of ["^generated-.*$", "^assigned-.*$", ""])
  for (const fields of metadata) {
    it(`Core name selection ${pattern}/${JSON.stringify(fields)}`, () => {
      ExemptionStore.init();
      ExemptionStore.add({
        metadata: { uid: "owner", namespace: "uds-policy-exemptions" },
        spec: {
          exemptions: [
            {
              matcher: { namespace: "app", name: pattern, kind: MatcherKind.Pod },
              policies: [Policy.DisallowPrivileged],
            },
          ],
        },
      });
      const object = { metadata: { namespace: "app", ...fields } };
      // This fixture supplies the Raw metadata consumed by the helper; it does
      // not construct the unrelated methods of a full SDK admission request.
      const request = { Raw: object } as unknown as Parameters<typeof isExempt>[0];
      const matched = isExempt(request, Policy.DisallowPrivileged);
      cases.push({ pattern, object, matched });
      if ("name" in fields && fields.name === "assigned-one" && pattern === "^generated-.*$")
        expect(matched).toBe(false);
      if (!("name" in fields) && !("generateName" in fields)) expect(matched).toBe(false);
    });
  }
afterAll(() =>
  writeFileSync(
    "src/go-controller/webhook/testdata/exemption-name-parity.json",
    JSON.stringify(
      {
        sourceRevision: "c15677633cffa17e99656a7d7ccd1f98d7cb6e4d",
        cases,
      },
      null,
      2,
    ) + "\n",
  ),
);
