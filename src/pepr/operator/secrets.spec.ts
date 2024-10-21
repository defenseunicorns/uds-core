/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import { K8s, kind } from "pepr";

const failIfReached = () => expect(true).toBe(false);

describe("test secret copy", () => {
  const sourceSecret = {
    metadata: {
      name: "source-secret",
      namespace: "source-namespace",
    },
    data: { key: "TESTCASE" },
  };

  beforeAll(async () => {
    // Setup test namespaces
    await K8s(kind.Namespace).Apply({
      metadata: { name: "source-namespace" },
    });
    await K8s(kind.Namespace).Apply({
      metadata: { name: "destination-namespace" },
    });
    await K8s(kind.Namespace).Apply({
      metadata: { name: "destination-namespace2" },
    });
    await K8s(kind.Namespace).Apply({
      metadata: { name: "destination-namespace3" },
    });

    // Create source secret
    await K8s(kind.Secret).Apply(sourceSecret);
  });

  afterAll(async () => {
    // Cleanup test namespaces
    await K8s(kind.Namespace).Delete("source-namespace");
    await K8s(kind.Namespace).Delete("destination-namespace");
    await K8s(kind.Namespace).Delete("destination-namespace2");
    // await K8s(kind.Namespace).Delete("destination-namespace3");
  });

  it("should copy a secret with the secrets.uds.dev/copy label", async () => {
    // Apply destination secret
    const destinationSecret = {
      metadata: {
        name: "destination-secret",
        namespace: "destination-namespace",
        labels: { "secrets.uds.dev/copy": "true" },
        annotations: {
          "secrets.uds.dev/fromNamespace": "source-namespace",
          "secrets.uds.dev/fromName": "source-secret",
        },
      },
    };

    // Check if destination secret has the same data as the source secret
    const destSecret = await K8s(kind.Secret).Apply(destinationSecret);
    expect(destSecret.data).toEqual({ key: "VEVTVENBU0U=" }); // base64 encoded "TESTCASE"

    // Confirm that label has changed from copy to copied
    expect(destSecret.metadata?.labels).toEqual({
      "secrets.uds.dev/copied": "true",
    });
  });

  it("should not copy a secret without the secrets.uds.dev/copy=true label", async () => {
    // Apply destination secret
    const destinationSecret1 = {
      metadata: {
        name: "destination-secret-tc2a",
        namespace: "destination-namespace2",
        labels: { "secrets.uds.dev/copy": "false" },
        annotations: {
          "secrets.uds.dev/fromNamespace": "source-namespace",
          "secrets.uds.dev/fromName": "source-secret",
        },
      },
    };

    const destinationSecret2 = {
      metadata: {
        name: "destination-secret-tc2b",
        namespace: "destination-namespace2",
        labels: { asdf: "true" },
        annotations: {
          "secrets.uds.dev/fromNamespace": "source-namespace",
          "secrets.uds.dev/fromName": "source-secret",
        },
      },
    };

    const destSecret1 = await K8s(kind.Secret).Apply(destinationSecret1);
    const destSecret2 = await K8s(kind.Secret).Apply(destinationSecret2);

    // Confirm destination secrets are created "as is"
    expect(destSecret1.data).toEqual(undefined);
    expect(destSecret1.metadata?.labels).toEqual({
      "secrets.uds.dev/copy": "false",
    });

    expect(destSecret2.data).toEqual(undefined);
    expect(destSecret2.metadata?.labels).toEqual({ asdf: "true" });
  });

  it("should error when copy label is present but missing annotations", async () => {
    const destinationSecret = {
      metadata: {
        name: "destination-secret-tc3",
        namespace: "destination-namespace3",
        labels: { "secrets.uds.dev/copy": "true" },
      },
    };

    const expected = (e: Error) => {
      expect(e).toMatchObject({
        ok: false,
        data: {
          message: expect.stringContaining("denied the request"),
        },
      });
    };

    return K8s(kind.Secret).Apply(destinationSecret).then(failIfReached).catch(expected);
  });

  it("should error when missing source secret and onMissingSource=Deny", async () => {
    const destinationSecret = {
      metadata: {
        name: "destination-secret",
        namespace: "destination-namespace",
        labels: { "secrets.uds.dev/copy": "true" },
        annotations: {
          "secrets.uds.dev/fromNamespace": "missing-namespace",
          "secrets.uds.dev/fromName": "missing-secret",
          "secrets.uds.dev/onMissingSource": "Deny",
        },
      },
    };

    const expected = (e: Error) => {
      expect(e).toMatchObject({
        ok: false,
        data: {
          message: expect.stringContaining("denied the request"),
        },
      });
    };

    return K8s(kind.Secret).Apply(destinationSecret).then(failIfReached).catch(expected);
  });

  it("should create empty secret when missing source secret and onMissingSource=LeaveEmpty", async () => {
    const destinationSecret = {
      metadata: {
        name: "destination-secret-tc4a",
        namespace: "destination-namespace",
        labels: { "secrets.uds.dev/copy": "true" },
        annotations: {
          "secrets.uds.dev/fromNamespace": "source-namespace",
          "secrets.uds.dev/fromName": "missing-secret",
          "secrets.uds.dev/onMissingSource": "LeaveEmpty",
        },
      },
    };

    const destSecret = await K8s(kind.Secret).Apply(destinationSecret);

    expect(destSecret.data).toEqual(undefined);
  });
});
