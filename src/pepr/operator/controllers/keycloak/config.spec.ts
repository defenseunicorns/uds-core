/**
 * Copyright 2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { K8s, kind } from "pepr";
import { afterEach, beforeEach, describe, expect, it, Mock, vi } from "vitest";
import {
  KEYCLOAK_CLIENTS_SECRET_NAME,
  KEYCLOAK_CLIENTS_SECRET_NAMESPACE,
} from "./client-secret-sync";
import { setupKeycloakClientSecret } from "./config";

const namespaceGetMock = vi.fn();
const namespaceApplyMock = vi.fn();
const secretGetMock = vi.fn();

vi.mock("pepr", () => ({
  K8s: vi.fn(),
  kind: {
    Namespace: "Namespace",
    Secret: "Secret",
  },
  Log: {
    child: vi.fn().mockReturnValue({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
}));

describe("Keycloak config", () => {
  beforeEach(() => {
    process.env.PEPR_WATCH_MODE = "true";
    namespaceGetMock.mockResolvedValue({ metadata: { name: KEYCLOAK_CLIENTS_SECRET_NAMESPACE } });
    namespaceApplyMock.mockResolvedValue({});
    secretGetMock.mockResolvedValue({ metadata: { name: KEYCLOAK_CLIENTS_SECRET_NAME } });

    (K8s as Mock).mockImplementation(resourceKind => {
      if (resourceKind === kind.Namespace) {
        return {
          Get: namespaceGetMock,
          Apply: namespaceApplyMock,
        };
      }

      return {
        InNamespace: vi.fn().mockReturnValue({ Get: secretGetMock }),
      };
    });
  });

  afterEach(() => {
    delete process.env.PEPR_WATCH_MODE;
    delete process.env.PEPR_MODE;
    vi.clearAllMocks();
  });

  it("does not apply an existing Keycloak namespace", async () => {
    await setupKeycloakClientSecret();

    expect(namespaceGetMock).toHaveBeenCalledWith(KEYCLOAK_CLIENTS_SECRET_NAMESPACE);
    expect(namespaceApplyMock).not.toHaveBeenCalled();
  });

  it("creates the Keycloak namespace when it does not exist", async () => {
    namespaceGetMock.mockRejectedValue({ status: 404, message: "not found" });

    await setupKeycloakClientSecret();

    expect(namespaceApplyMock).toHaveBeenCalledWith({
      metadata: { name: KEYCLOAK_CLIENTS_SECRET_NAMESPACE },
    });
  });

  it("does not create the Keycloak namespace when the namespace lookup fails", async () => {
    const error = { status: 500, message: "server error" };
    namespaceGetMock.mockRejectedValue(error);

    await expect(setupKeycloakClientSecret()).rejects.toEqual(error);

    expect(namespaceApplyMock).not.toHaveBeenCalled();
  });
});
