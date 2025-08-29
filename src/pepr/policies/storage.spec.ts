/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { V1Container, V1Volume, V1VolumeMount } from "@kubernetes/client-node";
import { a, PeprValidateRequest } from "pepr";
import { describe, expect, it, vi } from "vitest";
import * as common from "./common";
import * as exemptions from "./exemptions/index";
import {
  checkAllowedVolumeTypes,
  checkHostPathWrite,
  restrictHostPathWrite,
  restrictVolumeTypes,
} from "./storage";

type MockRequest = {
  Approve: () => string;
  Deny: (msg: string) => string;
  spec: {
    volumes: V1Volume[];
    containers?: V1Container[];
  };
  Raw?: {
    spec: {
      volumes: V1Volume[];
      containers?: V1Container[];
    };
  };
  _calls: string[];
  _exempt: boolean;
  _restoreContainers?: () => void;
};

describe("restrictVolumeTypes", () => {
  function makeMock(vols: V1Volume[], exempt: boolean): MockRequest {
    const calls: string[] = [];
    return {
      Approve: () => {
        calls.push("approve");
        return "approved";
      },
      Deny: (msg: string) => {
        calls.push("deny:" + msg);
        return `denied: ${msg}`;
      },
      spec: { volumes: vols },
      _calls: calls,
      _exempt: exempt,
    };
  }

  it("approves allowed volume types", () => {
    const req = makeMock(
      [
        { name: "a", configMap: {} } as V1Volume,
        { name: "b", secret: {} } as V1Volume,
        { name: "c", emptyDir: {} } as V1Volume,
      ],
      true,
    );
    const isExemptSpy = vi.spyOn(exemptions, "isExempt").mockReturnValue(req._exempt);
    const volumesSpy = vi.spyOn(common, "volumes").mockReturnValue(req.spec.volumes);
    const result = restrictVolumeTypes(req as unknown as PeprValidateRequest<a.Pod>);
    expect(result).toBe("approved");
    expect(req._calls[0]).toBe("approve");
    isExemptSpy.mockRestore();
    volumesSpy.mockRestore();
  });

  it("denies disallowed volume type", () => {
    const req = makeMock([{ name: "bad", hostPath: { path: "/data" } } as V1Volume], false);
    const isExemptSpy = vi.spyOn(exemptions, "isExempt").mockReturnValue(req._exempt);
    const volumesSpy = vi.spyOn(common, "volumes").mockReturnValue(req.spec.volumes);
    const result = restrictVolumeTypes(req as unknown as PeprValidateRequest<a.Pod>);
    expect(result).toContain("denied:");
    expect(req._calls[0]).toContain("deny:");
    isExemptSpy.mockRestore();
    volumesSpy.mockRestore();
  });

  it("approves if exempt", () => {
    const req = makeMock([{ name: "bad", hostPath: { path: "/data" } } as V1Volume], true);
    const isExemptSpy = vi.spyOn(exemptions, "isExempt").mockReturnValue(req._exempt);
    const volumesSpy = vi.spyOn(common, "volumes").mockReturnValue(req.spec.volumes);
    const result = restrictVolumeTypes(req as unknown as PeprValidateRequest<a.Pod>);
    expect(result).toBe("approved");
    expect(req._calls[0]).toBe("approve");
    isExemptSpy.mockRestore();
    volumesSpy.mockRestore();
  });
});

describe("checkAllowedVolumeTypes", () => {
  it("approves allowed volume types", () => {
    const result = checkAllowedVolumeTypes(
      [
        { name: "a", configMap: {} } as V1Volume,
        { name: "b", secret: {} } as V1Volume,
        { name: "c", emptyDir: {} } as V1Volume,
      ],
      false,
    );
    expect(result.approved).toBe(true);
  });

  it("denies disallowed volume type", () => {
    const result = checkAllowedVolumeTypes(
      [{ name: "bad", hostPath: { path: "/data" } } as V1Volume],
      false,
    );
    expect(result.approved).toBe(false);
    expect(result.message).toContain("hostPath");
  });

  it("approves if exempt", () => {
    const result = checkAllowedVolumeTypes(
      [{ name: "bad", hostPath: { path: "/data" } } as V1Volume],
      true,
    );
    expect(result.approved).toBe(true);
  });
});

describe("restrictHostPathWrite", () => {
  function makeMock(vols: V1Volume[], ctrs: V1Container[], exempt: boolean): MockRequest {
    const calls: string[] = [];
    const req: MockRequest = {
      Approve: () => {
        calls.push("approve");
        return "approved";
      },
      Deny: (msg: string) => {
        calls.push("deny:" + msg);
        return `denied: ${msg}`;
      },
      spec: { volumes: vols, containers: ctrs },
      Raw: { spec: { volumes: vols, containers: ctrs } },
      _calls: calls,
      _exempt: exempt,
      _restoreContainers: () => {},
    };
    // No need for containers function mock since we're properly typing the mock object
    return req;
  }

  it("approves hostPath mounted as readOnly", () => {
    const req = makeMock(
      [{ name: "hp", hostPath: { path: "/data" } } as V1Volume],
      [
        {
          volumeMounts: [{ name: "hp", readOnly: true, mountPath: "/mnt/data" } as V1VolumeMount],
        } as V1Container,
      ],
      false,
    );
    const isExemptSpy = vi.spyOn(exemptions, "isExempt").mockReturnValue(req._exempt);
    const volumesSpy = vi.spyOn(common, "volumes").mockReturnValue(req.spec.volumes);
    const result = restrictHostPathWrite(req as unknown as PeprValidateRequest<a.Pod>);
    expect(result).toBe("approved");
    expect(req._calls[0]).toBe("approve");
    isExemptSpy.mockRestore();
    volumesSpy.mockRestore();
    req._restoreContainers?.();
  });

  it("denies hostPath mounted as read/write", () => {
    const req = makeMock(
      [{ name: "hp", hostPath: { path: "/data" } } as V1Volume],
      [
        {
          volumeMounts: [{ name: "hp", readOnly: false, mountPath: "/mnt/data" } as V1VolumeMount],
        } as V1Container,
      ],
      false,
    );
    const isExemptSpy = vi.spyOn(exemptions, "isExempt").mockReturnValue(req._exempt);
    const volumesSpy = vi.spyOn(common, "volumes").mockReturnValue(req.spec.volumes);
    const result = restrictHostPathWrite(req as unknown as PeprValidateRequest<a.Pod>);
    expect(result).toContain("denied:");
    expect(req._calls[0]).toContain("deny:");
    isExemptSpy.mockRestore();
    volumesSpy.mockRestore();
    req._restoreContainers?.();
  });

  it("approves if exempt", () => {
    const req = makeMock(
      [{ name: "hp", hostPath: { path: "/data" } } as V1Volume],
      [
        {
          volumeMounts: [{ name: "hp", readOnly: false, mountPath: "/mnt/data" } as V1VolumeMount],
        } as V1Container,
      ],
      true,
    );
    const isExemptSpy = vi.spyOn(exemptions, "isExempt").mockReturnValue(req._exempt);
    const volumesSpy = vi.spyOn(common, "volumes").mockReturnValue(req.spec.volumes);
    const result = restrictHostPathWrite(req as unknown as PeprValidateRequest<a.Pod>);
    expect(result).toBe("approved");
    expect(req._calls[0]).toBe("approve");
    isExemptSpy.mockRestore();
    volumesSpy.mockRestore();
    req._restoreContainers?.();
  });
});

describe("checkHostPathWrite", () => {
  it("approves hostPath mounted as readOnly", () => {
    const result = checkHostPathWrite(
      [{ name: "hp", hostPath: { path: "/data" } } as V1Volume],
      [
        {
          volumeMounts: [{ name: "hp", readOnly: true, mountPath: "/mnt/data" } as V1VolumeMount],
        } as V1Container,
      ],
      false,
    );
    expect(result.approved).toBe(true);
  });

  it("denies hostPath mounted as read/write", () => {
    const result = checkHostPathWrite(
      [{ name: "hp", hostPath: { path: "/data" } } as V1Volume],
      [
        {
          volumeMounts: [{ name: "hp", readOnly: false, mountPath: "/mnt/data" } as V1VolumeMount],
        } as V1Container,
      ],
      false,
    );
    expect(result.approved).toBe(false);
    expect(result.message).toContain("readOnly");
  });

  it("approves if exempt", () => {
    const result = checkHostPathWrite(
      [{ name: "hp", hostPath: { path: "/data" } } as V1Volume],
      [
        {
          volumeMounts: [{ name: "hp", readOnly: false, mountPath: "/mnt/data" } as V1VolumeMount],
        } as V1Container,
      ],
      true,
    );
    expect(result.approved).toBe(true);
  });
});
