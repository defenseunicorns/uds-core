// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { consumeIdentityBuildReceipt } from './identity-receipt.mjs';

const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const go = process.env.GO_BINARY || 'go';
const execute = (cmd, args, options = {}) => execFileSync(cmd, args, { encoding: 'utf8', ...options });

function fixture(t, platformCount = 1) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'native-identity-receipt-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const module = path.join(root, 'src/dev-identity');
  fs.mkdirSync(path.join(module, 'cmd/dev-identity'), { recursive: true });
  const source = { 'go.mod': 'module example.test/identity\n\ngo 1.27\n', 'go.sum': '', 'cmd/dev-identity/main.go': 'package main\nfunc main() {}\n' };
  const bridgeSourceFiles = {};
  for (const [name, text] of Object.entries(source)) {
    fs.writeFileSync(path.join(module, name), text);
    bridgeSourceFiles[name] = sha(text);
  }
  const pins = { goVersion: 'go1.27.1', targetOS: 'linux', targetArchitecture: 'amd64', targetAMD64: 'v1', CGOEnabled: '0', dexCommit: 'pinned-commit' };
  const recipeFiles = {};
  for (const name of ['build-images.py', 'provider-inputs.json', 'dex-core-dev.patch', 'Dockerfile.bridge', 'Dockerfile.dex']) {
    const content = name === 'provider-inputs.json' ? JSON.stringify(pins) : 'frozen recipe\n';
    fs.writeFileSync(path.join(module, name), content);
    recipeFiles[name] = sha(content);
  }
  const content = path.join(root, 'oci');
  fs.mkdirSync(path.join(content, 'blobs/sha256'), { recursive: true });
  function blob(value, mediaType) {
    const bytes = Buffer.isBuffer(value) ? value : Buffer.from(JSON.stringify(value));
    const digest = `sha256:${sha(bytes)}`;
    fs.writeFileSync(path.join(content, 'blobs', digest.replace(':', '/')), bytes);
    return { mediaType, digest, size: bytes.length };
  }
  const compiler = path.join(execute(go, ['env', 'GOROOT']).trim(), 'bin/go');
  const receipt = { mode: 'release', pins, recipeFiles, bridgeSourceFiles, goExecutableSHA256: sha(fs.readFileSync(compiler)) };
  const manifests = [], localImages = new Map(), configurations = new Map(), layers = [];
  for (const [kind, entrypoint] of [['bridge', '/usr/local/bin/dev-identity'], ['dex', '/usr/local/bin/dex-dev']]) {
    const config = blob({ architecture: 'amd64', os: 'linux', config: { User: '65532:65532', Entrypoint: [entrypoint] } }, 'application/vnd.oci.image.config.v1+json');
    const layer = blob(Buffer.from(`${kind} binary layer`), 'application/vnd.oci.image.layer.v1.tar');
    layers.push(path.join(content, 'blobs', layer.digest.replace(':', '/')));
    const manifest = blob({ schemaVersion: 2, config, layers: [layer] }, 'application/vnd.oci.image.manifest.v1+json');
    const platforms = platformCount ? Array.from({ length: platformCount }, () => ({ ...manifest, platform: { os: 'linux', architecture: 'amd64' } })) : [{ ...manifest, platform: { os: 'linux', architecture: 'arm64' } }];
    const index = blob({ schemaVersion: 2, manifests: platforms }, 'application/vnd.oci.image.index.v1+json');
    const tag = `review/${kind}:rebuilt`;
    const canonical = `docker.io/${tag}`;
    manifests.push({ ...index, annotations: { 'io.containerd.image.name': canonical } });
    localImages.set(canonical, index.digest);
    configurations.set(canonical, config.digest);
    receipt[`${kind}Image`] = { tag, localImageID: index.digest };
    receipt[`${kind}Binary`] = { SHA256: sha(`${kind} binary`), staticLinuxAMD64: true };
  }
  fs.writeFileSync(path.join(content, 'index.json'), JSON.stringify({ schemaVersion: 2, manifests }));
  const archive = path.join(root, 'images.tar');
  const receiptPath = path.join(root, 'build-receipt.json');
  function pack() {
    execute('tar', ['-cf', archive, '-C', content, 'index.json', 'blobs']);
    receipt.archive = { file: archive, SHA256: sha(fs.readFileSync(archive)) };
    fs.writeFileSync(receiptPath, JSON.stringify(receipt));
  }
  pack();
  const options = { root, go, docker: 'docker', identity: { bridgeImage: 'frozen:old', dexImage: 'frozen-dex:old' }, receiptPath,
    run: (cmd, args, opts) => cmd === 'docker' ? JSON.stringify([{ Id: localImages.get(args[2]) }]) : execute(cmd, args, opts) };
  return { root, module, receipt, receiptPath, archive, layers, localImages, configurations, options, pack };
}

test('local build receipt selects concrete OCI images without changing the frozen baseline', t => {
  const f = fixture(t);
  const baseline = structuredClone(f.options.identity);
  const actual = consumeIdentityBuildReceipt(f.options);
  assert.deepEqual(f.options.identity, baseline);
  assert.equal(actual.identity.bridgeImage, 'docker.io/review/bridge:rebuilt');
  assert.equal(actual.identity.dexImage, 'docker.io/review/dex:rebuilt');
  assert.match(actual.identity.bridgePlatformManifest, /^sha256:/);
  assert.notEqual(actual.identity.bridgePlatformManifest, actual.identity.bridgeImageID);
  assert.match(actual.identity.bridgeImageConfig, /^sha256:/);
  assert.equal(actual.provenance.liveQualified, false);
  assert.equal(actual.provenance.sha256, sha(fs.readFileSync(f.receiptPath)));
});

test('a receipt cannot select images built from stale compiler inputs', t => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.module, 'cmd/dev-identity/added.go'), 'package main\nconst changed = true\n');
  assert.throws(() => consumeIdentityBuildReceipt(f.options), /Identity compiler inputs differ/);
});

test('a retagged local image cannot satisfy a build receipt', t => {
  const f = fixture(t);
  f.localImages.set('docker.io/review/bridge:rebuilt', `sha256:${'f'.repeat(64)}`);
  assert.throws(() => consumeIdentityBuildReceipt(f.options), /Local identity image differs/);
});

for (const count of [0, 2]) test(`receipt rejects ${count} matching AMD64 manifests`, t => {
  const f = fixture(t, count);
  assert.throws(() => consumeIdentityBuildReceipt(f.options), /exactly one Linux AMD64/);
});

test('changing the saved archive invalidates its receipt', t => {
  const f = fixture(t);
  fs.appendFileSync(f.archive, 'tampered');
  assert.throws(() => consumeIdentityBuildReceipt(f.options), /archive checksum differs/);
});

test('updating the outer checksum cannot conceal a tampered OCI layer', t => {
  const f = fixture(t);
  fs.writeFileSync(f.layers[0], 'different binary layer');
  f.pack();
  assert.throws(() => consumeIdentityBuildReceipt(f.options), /descriptor checksum mismatch/);
});

test('receipt pins must match the current provider build', t => {
  const f = fixture(t);
  f.receipt.pins.goVersion = 'go1.26.0';
  fs.writeFileSync(f.receiptPath, JSON.stringify(f.receipt));
  assert.throws(() => consumeIdentityBuildReceipt(f.options), /current release build pins/);
});

test('Docker config IDs bind to the same archive without being mistaken for manifest IDs', t => {
  const f = fixture(t);
  for (const kind of ['bridge', 'dex']) {
    const reference = `docker.io/review/${kind}:rebuilt`;
    const config = f.configurations.get(reference);
    f.localImages.set(reference, config);
    f.receipt[`${kind}Image`].localImageID = config;
  }
  fs.writeFileSync(f.receiptPath, JSON.stringify(f.receipt));
  const selected = consumeIdentityBuildReceipt(f.options);
  assert.equal(selected.identity.bridgeImageID, selected.identity.bridgeImageConfig);
  assert.notEqual(selected.identity.bridgeIndexOrManifest, selected.identity.bridgeImageID);
});
