// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { verifyIdentitySource } from './identity-source.mjs';

const sha = data => crypto.createHash('sha256').update(data).digest('hex');
const digest = value => /^sha256:[a-f0-9]{64}$/.test(value || '');
const binaryHash = value => /^[a-f0-9]{64}$/.test(value || '');

function canonicalImage(reference) {
  if (typeof reference !== 'string' || !reference || reference.trim() !== reference || /\s/.test(reference) || reference.startsWith('-')) {
    throw new Error('Identity receipt requires concrete local image references');
  }
  if (!reference.includes('/')) return `docker.io/library/${reference}`;
  const first = reference.split('/')[0];
  return /[.:]/.test(first) || first === 'localhost' ? reference : `docker.io/${reference}`;
}

function inspectArchive(archive, expectedSHA, run) {
  if (!path.isAbsolute(archive || '') || !binaryHash(expectedSHA)) throw new Error('Identity receipt requires an absolute OCI archive and SHA256; build with --save-images');
  const bytes = fs.readFileSync(archive);
  if (sha(bytes) !== expectedSHA) throw new Error('Identity OCI archive checksum differs from the build receipt');
  const read = name => Buffer.from(run('tar', ['-xOf', archive, name], { encoding: null, maxBuffer: bytes.length + 1024 }));
  const index = JSON.parse(read('index.json'));
  if (index.schemaVersion !== 2 || !Array.isArray(index.manifests)) throw new Error('Identity archive has no OCI image index');
  const objects = new Map();
  function object(descriptor, json = true) {
    if (!digest(descriptor?.digest) || !Number.isSafeInteger(descriptor.size) || descriptor.size < 0 || descriptor.size > bytes.length) {
      throw new Error('Invalid identity OCI descriptor');
    }
    if (!objects.has(descriptor.digest)) objects.set(descriptor.digest, read(`blobs/${descriptor.digest.replace(':', '/')}`));
    const raw = objects.get(descriptor.digest);
    if (raw.length !== descriptor.size || `sha256:${sha(raw)}` !== descriptor.digest) throw new Error('Identity OCI descriptor checksum mismatch');
    return json ? JSON.parse(raw) : raw;
  }
  function platforms(descriptor) {
    const value = object(descriptor);
    if (Array.isArray(value.manifests)) return value.manifests.flatMap(platforms);
    if (!Array.isArray(value.layers) || !value.config) throw new Error('Identity OCI image manifest is incomplete');
    const config = object(value.config);
    for (const layer of value.layers) object(layer, false);
    const platform = descriptor.platform || config;
    return platform.os === 'linux' && platform.architecture === 'amd64' ? [{ descriptor, config, configDigest: value.config.digest }] : [];
  }
  return (reference, imageID, entrypoint) => {
    const matches = index.manifests.filter(item => {
      const name = item.annotations?.['io.containerd.image.name'] || item.annotations?.['org.opencontainers.image.ref.name'];
      return name && canonicalImage(name) === reference;
    });
    if (matches.length !== 1) throw new Error(`Identity archive does not identify the exact local image: ${reference}`);
    const choices = platforms(matches[0]);
    if (choices.length !== 1) throw new Error(`Identity image requires exactly one Linux AMD64 manifest: ${reference}`);
    const selected = choices[0];
    // Docker's classic store identifies images by config; its containerd store
    // may report the index/manifest instead. Bind either form to this same graph.
    if (![matches[0].digest, selected.descriptor.digest, selected.configDigest].includes(imageID)) {
      throw new Error(`Identity archive does not identify the exact local image: ${reference}`);
    }
    if (selected.config.os !== 'linux' || selected.config.architecture !== 'amd64' ||
        selected.config.config?.User !== '65532:65532' || !isDeepStrictEqual(selected.config.config?.Entrypoint, [entrypoint])) {
      throw new Error(`Identity image runtime configuration differs from its build recipe: ${reference}`);
    }
    return { index: matches[0].digest, platform: selected.descriptor.digest, config: selected.configDigest };
  };
}

export function consumeIdentityBuildReceipt({ root, go, docker, run, identity, receiptPath }) {
  if (!path.isAbsolute(receiptPath || '')) throw new Error('Identity build receipt must use an absolute path');
  const raw = fs.readFileSync(receiptPath);
  const receipt = JSON.parse(raw);
  const module = path.join(root, 'src/dev-identity');
  const pins = JSON.parse(fs.readFileSync(path.join(module, 'provider-inputs.json')));
  if (receipt.mode !== 'release' || !isDeepStrictEqual(receipt.pins, pins) ||
      pins.targetOS !== 'linux' || pins.targetArchitecture !== 'amd64' || pins.targetAMD64 !== 'v1' || pins.CGOEnabled !== '0') {
    throw new Error('Identity receipt does not match the current release build pins');
  }
  const compiler = path.join(run(go, ['env', 'GOROOT']).trim(), 'bin', process.platform === 'win32' ? 'go.exe' : 'go');
  if (receipt.goExecutableSHA256 !== sha(fs.readFileSync(compiler))) throw new Error('Identity receipt was built with a different Go compiler');
  const selected = { ...identity, bridgeSourceFiles: receipt.bridgeSourceFiles, providerRecipeFiles: receipt.recipeFiles };
  verifyIdentitySource({ root, go, run, identity: selected });
  const inspect = inspectArchive(receipt.archive?.file, receipt.archive?.SHA256, run);
  for (const [kind, entrypoint] of [['bridge', '/usr/local/bin/dev-identity'], ['dex', '/usr/local/bin/dex-dev']]) {
    const image = receipt[`${kind}Image`];
    const binary = receipt[`${kind}Binary`];
    if (!image || !digest(image.localImageID) || !binaryHash(binary?.SHA256) || binary.staticLinuxAMD64 !== true) {
      throw new Error(`Identity receipt lacks verified ${kind} image and binary metadata`);
    }
    const reference = canonicalImage(image.tag);
    const actual = JSON.parse(run(docker, ['image', 'inspect', reference]));
    if (actual.length !== 1 || actual[0].Id !== image.localImageID) throw new Error(`Local identity image differs from the build receipt: ${reference}`);
    const content = inspect(reference, image.localImageID, entrypoint);
    Object.assign(selected, { [`${kind}Image`]: reference, [`${kind}ImageID`]: image.localImageID,
      [`${kind}IndexOrManifest`]: content.index, [`${kind}PlatformManifest`]: content.platform,
      [`${kind}ImageConfig`]: content.config, [`${kind}BinarySHA256`]: binary.SHA256 });
  }
  if (selected.bridgeImage === selected.dexImage) throw new Error('Identity providers require distinct images');
  selected.bridgeSourceSHA256 = sha(JSON.stringify(Object.entries(selected.bridgeSourceFiles).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)));
  selected.upstreamDexCommit = pins.dexCommit;
  selected.sourceSplitNotice = 'Selected from a verified local build receipt; this selection does not establish live qualification.';
  return { identity: selected, provenance: { path: receiptPath, sha256: sha(raw), archive: receipt.archive.file,
    archiveSHA256: receipt.archive.SHA256, liveQualified: false,
    qualification: 'source-and-artifact-integrity-only; run the documented live validation for these exact images' } };
}
