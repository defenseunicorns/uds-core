/** Copyright 2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */
import { afterAll, expect, it } from "vitest";
import { writeFileSync } from "node:fs";
import { annotateMutation } from "../../../pepr/policies/common.js";
import { Policy } from "../../../pepr/operator/crd/index.js";

const cases: unknown[] = [];
const annotations = [
  "",
  "[]",
  " [\r\n] ",
  '["drop-all-capabilities","disallow-privileged","drop-all-capabilities"]',
  '["\\u0064rop-all-capabilities"]',
  '[{"z":1,"a":2},null,true]',
  "[1.0,1e2,-0]",
  '["<tag>&\\u2028\\u2029"]',
  '["\\ud800"]',
  '["\\udc00"]',
  '["\\ud83d\\ude00"]',
  '[{"9":1,"1":2,"x":3,"0":4,"a":5}]',
  "[1e400,-1e400,9007199254740993,0.0000001]",
  '[true,false,"unknown",{"__proto__":{"constructor":"data"}}]',
  "null",
  "{}",
  "[",
  '"text"',
  "42",
  "false",
];
for (const annotation of annotations)
  for (const alreadyDefaulted of [false, true]) {
    it(`pinned diagnostic ${annotation}/${alreadyDefaulted}`, () => {
      const raw = { metadata: { annotations: { "uds-core.pepr.dev/mutated": annotation } } };
      const request = {
        Raw: raw,
        SetAnnotation: (key: string, value: string) => {
          (raw.metadata.annotations as Record<string, string>)[key] = value;
        },
      };
      // Only Raw and SetAnnotation are consumed by this source helper.
      const sourceRequest = request as unknown as Parameters<typeof annotateMutation>[0];
      let failed = false;
      try {
        if (!alreadyDefaulted) annotateMutation(sourceRequest, Policy.DisallowPrivileged);
        annotateMutation(sourceRequest, Policy.RequireNonRootUser);
        annotateMutation(sourceRequest, Policy.DropAllCapabilities);
      } catch {
        failed = true;
      }
      if (["null", "{}", "[", '"text"', "42", "false"].includes(annotation))
        expect(failed).toBe(true);
      else expect(failed).toBe(false);
      cases.push({
        annotation,
        alreadyDefaulted,
        failed,
        expected: raw.metadata.annotations["uds-core.pepr.dev/mutated"],
      });
    });
  }
afterAll(() =>
  writeFileSync(
    "src/go-controller/internal/admission/policies/testdata/core-diagnostic-parity.json",
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
