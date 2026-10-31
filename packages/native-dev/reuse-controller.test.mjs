// Copyright 2026 Defense Unicorns
// SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyControllerReuse, verifyLocalController } from './reuse-controller.mjs';

const sha = 'a'.repeat(64);
const snapshot = () => ({
  core: { sourceCommit: 'pinned-core' }, go: 'go1.27.1', distroless: 'distroless@sha256:fixed',
  controllerImage: 'docker.io/library/uds-core-native-controller:fixed',
  controllerImageID: `sha256:${sha}`, controllerBinarySHA256: sha, sourceSHA256: sha,
  sourceFiles: { 'src/go-controller/main.go': sha, 'packages/native-dev/scripts/fence.go': sha },
});

test('package-only changes retain the qualified image without relabeling its source', () => {
  const receipt = snapshot(), lock = snapshot();
  lock.sourceSHA256 = 'b'.repeat(64);
  lock.sourceFiles['packages/native-dev/scripts/fence.go'] = 'b'.repeat(64);
  lock.sourceFiles['packages/native-dev/new-script.mjs'] = sha;
  assert.deepEqual(verifyControllerReuse(receipt, lock), { imageID: receipt.controllerImageID, sourceSHA256: sha });
});

test('runtime, source-tree, binary and tool changes require a new checkpoint', () => {
  for (const mutate of [
    lock => { lock.sourceFiles['src/go-controller/main.go'] = 'changed'; },
    lock => { delete lock.sourceFiles['src/go-controller/main.go']; },
    lock => { lock.sourceFiles['src/go-controller/new.go'] = sha; },
    lock => { lock.controllerBinarySHA256 = 'changed'; },
    lock => { lock.go = 'other-go'; },
    lock => { lock.distroless = 'other-base'; },
    lock => { lock.core.sourceCommit = 'other-core'; },
  ]) {
    const lock = snapshot();
    mutate(lock);
    assert.throws(() => verifyControllerReuse(snapshot(), lock));
  }
  assert.throws(() => verifyControllerReuse({ ...snapshot(), controllerImageID: null }, snapshot()));
});

test('retagged or relabeled local images cannot satisfy frozen provenance', () => {
  const receipt = snapshot(), frozen = verifyControllerReuse(receipt, snapshot());
  const image = { Id: receipt.controllerImageID, Config: { Labels: {
    'dev.uds.native.source-sha256': sha, 'dev.uds.native.binary-sha256': sha,
  } } };
  verifyLocalController(image, frozen, sha);
  assert.throws(() => verifyLocalController({ ...image, Id: `sha256:${'b'.repeat(64)}` }, frozen, sha));
  image.Config.Labels['dev.uds.native.source-sha256'] = 'b'.repeat(64);
  assert.throws(() => verifyLocalController(image, frozen, sha));
});
