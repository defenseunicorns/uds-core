/**
 * Copyright 2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */
import { kind, PeprValidateRequest } from "pepr";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { IstioVirtualService, Phase, UDSPackage } from "..";
import { protectedServiceError, validateHostService } from "./host-service";

const { read } = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock("pepr", async importOriginal => ({
  ...(await importOriginal<typeof import("pepr")>()),
  K8s: (type: unknown) => {
    const query = {
      Get: () => read(type),
      InNamespace: () => query,
      WithLabel: () => query,
    };
    return query;
  },
}));

const exposure = { host: "docs", service: "web", port: 80, selector: { app: "web" } };
const client = { name: "Docs", clientId: "docs", authservice: { exposeHost: "docs" } };
const blue = { app: "web", release: "blue" };
const green = { app: "web", release: "green" };
const svc = (name: string, selector: Record<string, string>): kind.Service => ({
  metadata: { name, namespace: "docs" },
  spec: { selector, ports: [{ port: 80 }] },
});

function request(current: kind.Service, old?: kind.Service, deleting = false) {
  return {
    Raw: current,
    OldResource: old,
    Request: { operation: deleting ? "DELETE" : old ? "UPDATE" : "CREATE" },
    Approve: () => "allow",
    Deny: (error: string) => error,
  } as unknown as PeprValidateRequest<kind.Service>;
}

describe("host-protected Services", () => {
  let pkg: UDSPackage;
  let terminating: boolean;
  beforeEach(() => {
    terminating = false;
    pkg = {
      metadata: { name: "docs", namespace: "docs", uid: "uid", generation: 1 },
      spec: {
        network: { expose: [exposure, { service: "api", host: "api", selector: { app: "api" } }] },
        sso: [client],
      },
      status: { observedGeneration: 1, authserviceClients: [{ clientId: "docs", selector: blue }] },
    };
    read.mockReset().mockImplementation(type => {
      if (type === UDSPackage) return { items: [pkg] };
      if (type === kind.Service) return { items: [svc("web", blue), svc("api", { app: "api" })] };
      if (type === kind.Namespace)
        return { metadata: { deletionTimestamp: terminating ? new Date() : undefined } };
      if (type === IstioVirtualService)
        return {
          items: [
            {
              spec: {
                http: [{ route: [{ destination: { host: "web.docs.svc.cluster.local" } }] }],
              },
            },
          ],
        };
      throw new Error("Unexpected API request");
    });
  });

  it("keeps metadata-only updates off the API", async () => {
    const current = svc("web", blue);
    current.metadata!.labels = { team: "docs" };
    expect(await validateHostService(request(current, svc("web", blue)))).toBe("allow");
    expect(read).not.toHaveBeenCalled();
  });

  it("protects the full live Service selector on updates and recreation", async () => {
    expect(await validateHostService(request(svc("web", green), svc("web", blue)))).toMatch(
      /selector/,
    );
    expect(await validateHostService(request(svc("web", green)))).toMatch(/selector/);
    expect(await validateHostService(request(svc("web", blue)))).toBe("allow");
  });

  it("allows initial provisioning, then freezes the selected pods", async () => {
    delete pkg.status;
    expect(await validateHostService(request(svc("web", green)))).toBe("allow");
    expect(await validateHostService(request(svc("web", blue), svc("web", green)))).toMatch(
      /selector/,
    );
  });

  it("rejects a referenced alias that begins selecting protected pods", async () => {
    expect(await validateHostService(request(svc("api", { app: "web" })))).toMatch(/isolate/);
    expect(
      await validateHostService(request(svc("api", blue), svc("api", { app: "api" }))),
    ).toMatch(/isolate/);
    expect(await validateHostService(request(svc("api", { app: "other" })))).toBe("allow");
  });

  it("rejects overlapping alias creation before the protected Service exists", async () => {
    read.mockReturnValueOnce({ items: [pkg] }).mockReturnValueOnce({ items: [] });
    expect(await validateHostService(request(svc("api", green)))).toMatch(/isolate/);
  });

  it("blocks deletion until withdrawal, except during namespace teardown", async () => {
    const deletion = request(svc("web", blue), svc("web", blue), true);
    expect(await validateHostService(deletion)).toMatch(/before deleting/);
    terminating = true;
    expect(await validateHostService(deletion)).toBe("allow");
  });

  it("retains the old Service identity until the previous protected route is withdrawn", async () => {
    pkg.metadata!.generation = 2;
    pkg.spec!.sso = [];
    expect(await validateHostService(request(svc("web", green), svc("web", blue)))).toMatch(
      /withdraw/,
    );
    pkg.status = { observedGeneration: 2, phase: Phase.Failed };
    expect(await validateHostService(request(svc("web", green), svc("web", blue)))).toMatch(
      /withdraw/,
    );
    read.mockReturnValueOnce({ items: [pkg] }).mockReturnValueOnce({ items: [] });
    expect(await validateHostService(request(svc("web", green), svc("web", blue)))).toBe("allow");
  });

  it("requires a selector-backed Service with the declared TCP port", () => {
    const service = svc("web", blue);
    service.spec!.type = "ExternalName";
    expect(protectedServiceError(exposure, service)).toMatch(/selector-backed/);
    service.spec!.type = "ClusterIP";
    service.spec!.ports = [{ port: 80, protocol: "UDP" }];
    expect(protectedServiceError(exposure, service)).toMatch(/TCP port/);
    service.spec!.ports = [{ port: 80, targetPort: 8080 }];
    expect(protectedServiceError(exposure, service)).toMatch(/target port/);
    expect(protectedServiceError({ ...exposure, targetPort: 8080 }, service)).toBeUndefined();
    expect(protectedServiceError({ ...exposure, selector: { app: "another" } }, service)).toMatch(
      /selector labels/,
    );
  });

  it("rejects a named target port for a protected Service", async () => {
    const service = svc("web", blue);
    service.spec!.ports = [{ port: 80, targetPort: "http" }];
    expect(await validateHostService(request(service))).toMatch(/target port must be numeric/);
  });
});
