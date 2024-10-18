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
    await K8s(kind.Namespace).Apply({ metadata: { name: "source-namespace" } });
    await K8s(kind.Namespace).Apply({ metadata: { name: "destination-namespace" } });

    // Create source secret
    await K8s(kind.Secret).Apply(sourceSecret);
  });

  afterAll(async () => {
    // Cleanup test namespaces
    await K8s(kind.Namespace).Delete("source-namespace");
    await K8s(kind.Namespace).Delete("destination-namespace");
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

    await K8s(kind.Secret).Apply(destinationSecret);

    // Check if destination secret has the same data as the source secret
    const destSecret = await K8s(kind.Secret)
      .InNamespace("destination-namespace")
      .Get("destination-secret");

    // output destSecret
    console.log("Destination Secret:");
    console.log(destSecret);

    expect(destSecret.data).toEqual(sourceSecret.data);

    // Confirm that label has changed from copy to copied
    expect(destSecret.metadata?.labels).toEqual({ "secrets.uds.dev/copied": "true" });
  });

  it("should not copy a secret without the secrets.uds.dev/copy=true label", async () => {
    // Apply destination secret
    const destinationSecret1 = {
      metadata: {
        name: "destination-secret",
        namespace: "destination-namespace",
        labels: { "secrets.uds.dev/copy": "false" },
        annotations: {
          "secrets.uds.dev/fromNamespace": "source-namespace",
          "secrets.uds.dev/fromName": "source-secret",
        },
      },
    };

    const destinationSecret2 = {
      metadata: {
        name: "destination-secret",
        namespace: "destination-namespace",
        labels: {},
        annotations: {
          "secrets.uds.dev/fromNamespace": "source-namespace",
          "secrets.uds.dev/fromName": "source-secret",
        },
      },
    };

    await K8s(kind.Secret).Apply(destinationSecret1);
    await K8s(kind.Secret).Apply(destinationSecret2);

    // Confirm destination secrets are created "as is"
    const destSecret1 = await K8s(kind.Secret)
      .InNamespace("destination-namespace")
      .Get("destination-secret");
    expect(destSecret1.data).toEqual({});
    expect(destSecret1.metadata?.labels).toEqual({ "secrets.uds.dev/copy": "false" });

    const destSecret2 = await K8s(kind.Secret)
      .InNamespace("destination-namespace")
      .Get("destination-secret");
    expect(destSecret2.data).toEqual({});
    expect(destSecret2.metadata?.labels).toEqual({});
  });

  it("should error by default when copy label is present but missing annotations", async () => {
    const destinationSecret = {
      metadata: {
        name: "destination-secret",
        namespace: "destination-namespace",
        labels: { "secrets.uds.dev/copy": "true" },
      },
    };

    const expected = (e: Error) => {
      expect(e).toMatchObject({
        ok: false,
        data: {
          message: expect.stringContaining("Missing required annotations for secret copy"),
        },
      });
    };

    return K8s(kind.Secret).Apply(destinationSecret).then(failIfReached).catch(expected);
  });

  it("should error when missing source secret and onMissingSource=Error", async () => {
    const destinationSecret = {
      metadata: {
        name: "destination-secret",
        namespace: "destination-namespace",
        labels: { "secrets.uds.dev/copy": "true" },
        annotations: {
          "secrets.uds.dev/fromNamespace": "missing-namespace",
          "secrets.uds.dev/fromName": "missing-secret",
          "secrets.uds.dev/onMissingSource": "Error",
        },
      },
    };

    const expected = (e: Error) => {
      expect(e).toMatchObject({
        ok: false,
        data: {
          message: expect.stringContaining("not found in namespace"),
        },
      });
    };

    return K8s(kind.Secret).Apply(destinationSecret).then(failIfReached).catch(expected);
  });

  it("should create empty secret when missing source secret and onMissingSource=LeaveEmpty", async () => {
    const destinationSecret = {
      metadata: {
        name: "destination-secret",
        namespace: "destination-namespace",
        labels: { "secrets.uds.dev/copy": "true" },
        annotations: {
          "secrets.uds.dev/fromNamespace": "missing-namespace",
          "secrets.uds.dev/fromName": "missing-secret",
          "secrets.uds.dev/onMissingSource": "LeaveEmpty",
        },
      },
    };

    await K8s(kind.Secret).Apply(destinationSecret);

    const destSecret = await K8s(kind.Secret)
      .InNamespace("destination-namespace")
      .Get("destination-secret");
    expect(destSecret.data).toEqual({});
  });

  it("should do nothing when missing source secret and onMissingSource=Ignore", async () => {
    const destinationSecret = {
      metadata: {
        name: "destination-secret",
        namespace: "destination-namespace",
        labels: { "secrets.uds.dev/copy": "true" },
        annotations: {
          "secrets.uds.dev/fromNamespace": "missing-namespace",
          "secrets.uds.dev/fromName": "missing-secret",
          "secrets.uds.dev/onMissingSource": "Ignore",
        },
      },
    };

    await K8s(kind.Secret).Apply(destinationSecret);

    const destSecret = await K8s(kind.Secret)
      .InNamespace("destination-namespace")
      .Get("destination-secret");
    expect(destSecret).toBe(undefined);
  });
});
