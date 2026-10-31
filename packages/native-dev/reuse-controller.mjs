// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

// Packaging/helper-only changes must not rewrite a production tag already
// qualified on a live cluster. Reuse requires the entire frozen controller
// tree and the freshly compiled binary to match its recorded inputs.
export function verifyControllerReuse(receipt, lock) {
  for (const field of ['go', 'distroless', 'controllerImage', 'controllerBinarySHA256']) {
    if (!receipt[field] || receipt[field] !== lock[field]) {
      throw new Error(`Frozen controller input changed: ${field}`);
    }
  }
  if (receipt.core?.sourceCommit !== lock.core?.sourceCommit) {
    throw new Error('Frozen controller base commit changed');
  }
  const controllerFiles = files => Object.entries(files || {})
    .filter(([name]) => name.startsWith('src/go-controller/'))
    .sort(([a], [b]) => a.localeCompare(b));
  const frozen = controllerFiles(receipt.sourceFiles);
  if (!frozen.length || JSON.stringify(frozen) !== JSON.stringify(controllerFiles(lock.sourceFiles))) {
    throw new Error('Frozen controller source tree changed; a new production checkpoint is required');
  }
  const sourceSHA256 = receipt.controllerImageSourceSHA256 || receipt.sourceSHA256;
  if (!/^[a-f0-9]{64}$/.test(sourceSHA256 || '') || !/^sha256:[a-f0-9]{64}$/.test(receipt.controllerImageID || '')) {
    throw new Error('Frozen controller image/source digest missing');
  }
  return { imageID: receipt.controllerImageID, sourceSHA256 };
}

export function verifyLocalController(image, frozen, binarySHA256) {
  if (image.Id !== frozen.imageID ||
      image.Config?.Labels?.['dev.uds.native.source-sha256'] !== frozen.sourceSHA256 ||
      image.Config?.Labels?.['dev.uds.native.binary-sha256'] !== binarySHA256) {
    throw new Error('Local controller image does not match the frozen immutable checkpoint');
  }
}
