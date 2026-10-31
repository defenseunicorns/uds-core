// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

// Match the actual compiler inputs recorded by dev-identity/build-images.py,
// including newly added files, rather than checking only previously known paths.
export function verifyIdentitySource({ root, go, run, identity }) {
  const module = path.join(root, 'src/dev-identity');
  for (const name of ['build-images.py', 'provider-inputs.json', 'dex-core-dev.patch', 'Dockerfile.bridge', 'Dockerfile.dex']) {
    const actual = crypto.createHash('sha256').update(fs.readFileSync(path.join(module, name))).digest('hex');
    if (identity.providerRecipeFiles?.[name] !== actual) {
      throw new Error(`Identity build recipe differs from the frozen image: ${name}`);
    }
  }
  const compilerFields = ['GoFiles', 'CgoFiles', 'CFiles', 'CXXFiles', 'MFiles', 'HFiles',
    'FFiles', 'SFiles', 'SwigFiles', 'SwigCXXFiles', 'SysoFiles', 'EmbedFiles'];
  const format = '{{.Dir}}' + compilerFields.map(field => `{{range .${field}}}|{{.}}{{end}}`).join('');
  const listing = run(go, ['list', '-buildvcs=false', '-deps', '-f', format, './cmd/dev-identity'], {
    cwd: module,
    env: { ...process.env, GOWORK: 'off', GOTOOLCHAIN: 'local', CGO_ENABLED: '0', GOOS: 'linux', GOARCH: 'amd64', GOAMD64: 'v1', GOFLAGS: '' },
  });
  const files = new Set(['go.mod', 'go.sum']);
  for (const line of listing.trim().split('\n')) {
    const [directory, ...names] = line.split('|');
    if (directory !== module && !directory.startsWith(module + path.sep)) continue;
    for (const name of names) files.add(path.relative(module, path.join(directory, name)));
  }
  const actual = Object.fromEntries([...files].sort().map(name => [name, crypto.createHash('sha256').update(fs.readFileSync(path.join(module, name))).digest('hex')]));
  const expected = Object.fromEntries(Object.entries(identity.bridgeSourceFiles || {}).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
  if (!Object.keys(expected).length || JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error('Identity compiler inputs differ from the frozen image; rebuild the provider and update inputs.lock.json');
  }
  return actual;
}
