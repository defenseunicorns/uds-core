/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { K8s, kind } from 'pepr';

const POLICY_TESTS_NAMESPACE = "policy-tests";
const NAMESPACE_DELETE_TIMEOUT_MS = 30000;
const NAMESPACE_DELETE_POLL_INTERVAL_MS = 250;

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

const isNotFound = error => {
  const maybeError = error ?? {};

  return (
    maybeError.code === 404 ||
    maybeError.status === 404 ||
    maybeError.statusCode === 404 ||
    maybeError.response?.status === 404 ||
    maybeError.response?.statusCode === 404
  );
};

async function waitForNamespaceDeleted() {
  const deadline = Date.now() + NAMESPACE_DELETE_TIMEOUT_MS;

  while (Date.now() < deadline) {
    try {
      await K8s(kind.Namespace).Get(POLICY_TESTS_NAMESPACE);
    } catch (error) {
      if (isNotFound(error)) return;
      throw error;
    }

    await wait(NAMESPACE_DELETE_POLL_INTERVAL_MS);
  }

  throw new Error(
    `Timed out after ${NAMESPACE_DELETE_TIMEOUT_MS / 1000}s waiting for namespace ${POLICY_TESTS_NAMESPACE} to be deleted`,
  );
}

export async function setup() {
  await K8s(kind.Namespace).Apply({
    metadata: {
      name: POLICY_TESTS_NAMESPACE,
      labels: {
        "istio-injection": "disabled",
        "zarf.dev/agent": "ignore",
      },
    },
  });
}

export async function teardown() {
  try {
    await K8s(kind.Namespace).Delete(POLICY_TESTS_NAMESPACE);
  } catch (error) {
    if (!isNotFound(error)) throw error;
  }

  await waitForNamespaceDeleted();
}
