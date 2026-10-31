// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
import { writeFileSync } from "node:fs";
const patterns = ["", "job", "^job$", "^job-.*$", "^(?:job|worker)-[a-z0-9]+$", "^a{1,3}$", "a+?", ".", "^.$", "^..$",
  "(?<=job-)worker", "(?<!bad-)worker", "worker(?=-good)", "worker(?!-bad)", "(job)-\\1", "(?<prefix>job)-\\k<prefix>",
  "(?<n>a)|(?<n>b)", "(a)\\2", "\\8", "\\0", "\\cA", "\\q", "\\x61", "\\u0061", "\\u{61}", "\\p{L}+",
  "\\d+", "\\D+", "\\w+", "\\W+", "\\s+", "\\S+", "\\bjob\\b", "\\Bjob\\B", "[\\b]", "[a-z]", "[^a-z]", "[a-]", "[]", "[^]", "a$", "a*", "a{2,}", "a{2,1}", "*", "[", ")", "(?P<python>job)", "(?i)job", "[z-a]", "[a--b]", "(a|ab)+", "^a(?:b)?$", "a|worker", "[.]", "\\.", "\\-", "foo/bar"];
const names = ["job", "job-worker", "my-job-worker", "job-job", "worker-good", "bad-worker", "a", "ab", "aa", "b", "q", "8", "p{L}", "a.b", "a-b", "123", "", "a\n", "\u0001", "😀"];
const cases = [];
for (const pattern of patterns) {
  let expression;
  try { expression = new RegExp(pattern); } catch (error) { cases.push({ pattern, valid:false, error:error.message }); continue; }
  for (const name of names) cases.push({ pattern, valid:true, name, matched:expression.test(name), kubernetesName:/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/.test(name) });
}
writeFileSync("src/go-controller/internal/admission/exemptions/testdata/javascript-regex-parity.json", JSON.stringify({ sourceRevision:"c15677633cffa17e99656a7d7ccd1f98d7cb6e4d", runtime:process.version, cases },null,2)+"\n");
