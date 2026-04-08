/**
 * Copyright 2026 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { KeycloakClientMode } from "../../config/types";

const mockFetch = vi.fn();
const mockK8sGet = vi.fn();

vi.mock("pepr", () => ({
  K8s: () => ({
    InNamespace: () => ({
      Get: mockK8sGet,
    }),
  }),
  kind: { Secret: "Secret" },
  fetch: (...args: unknown[]) => mockFetch(...args),
  Log: {
    child: vi.fn().mockReturnValue({
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
}));

vi.mock("fs", () => ({
  default: {
    promises: {
      readFile: vi.fn().mockResolvedValue("mock-sa-token"),
    },
  },
}));

import fs from "fs";
import { UDSConfig } from "../../config/config";
import {
  credentialsGetAccessToken,
  getClientSecretToken,
  getSignedJwtToken,
  isCachedTokenValid,
  parseKeycloakToken,
  readServiceAccountToken,
  resetCachedToken,
} from "./client-credentials";

function makeJwt(exp: number): string {
  const header = Buffer.from(JSON.stringify({ alg: "RS256" })).toString("base64");
  const payload = Buffer.from(
    JSON.stringify({ exp, resource_access: { "realm-management": { roles: [] } } }),
  ).toString("base64");
  return `${header}.${payload}.signature`;
}

function okTokenResponse(token: string) {
  return { ok: true, status: 200, statusText: "OK", data: { access_token: token } };
}

function errorResponse(status: number, statusText: string) {
  return { ok: false, status, statusText, data: { error: statusText } };
}

describe("parseKeycloakToken", () => {
  it("should parse a valid JWT payload", () => {
    const jwt = makeJwt(9999999999);
    const parsed = parseKeycloakToken(jwt);
    expect(parsed.exp).toBe(9999999999);
  });
});

describe("readServiceAccountToken", () => {
  beforeEach(() => vi.clearAllMocks());

  it("should read the SA token from the filesystem", async () => {
    const token = await readServiceAccountToken("/mock/path");
    expect(fs.promises.readFile).toHaveBeenCalledWith("/mock/path", "utf-8");
    expect(token).toBe("mock-sa-token");
  });

  it("should throw a descriptive error when the file does not exist", async () => {
    vi.mocked(fs.promises.readFile).mockRejectedValueOnce(
      new Error("ENOENT: no such file or directory"),
    );

    await expect(readServiceAccountToken("/nonexistent")).rejects.toThrow(
      "Failed to read service account token at /nonexistent",
    );
  });

  it("should throw a descriptive error when the file is not readable", async () => {
    vi.mocked(fs.promises.readFile).mockRejectedValueOnce(new Error("EACCES: permission denied"));

    await expect(readServiceAccountToken("/restricted")).rejects.toThrow(
      "Failed to read service account token at /restricted",
    );
  });
});

describe("isCachedTokenValid", () => {
  beforeEach(() => resetCachedToken());

  it("should return false when no token is cached", () => {
    expect(isCachedTokenValid()).toBe(false);
  });

  it("should return true when cached token is not expired", async () => {
    UDSConfig.keycloakClientMode = KeycloakClientMode.CLIENT_SECRET;
    mockK8sGet.mockResolvedValue({
      data: { "uds-operator": Buffer.from("test-secret").toString("base64") },
    });
    const futureToken = makeJwt(Math.floor(Date.now() / 1000) + 3600);
    mockFetch.mockResolvedValue(okTokenResponse(futureToken));

    await credentialsGetAccessToken();
    expect(isCachedTokenValid()).toBe(true);
  });

  it("should return false when cached token is expired", async () => {
    UDSConfig.keycloakClientMode = KeycloakClientMode.CLIENT_SECRET;
    mockK8sGet.mockResolvedValue({
      data: { "uds-operator": Buffer.from("test-secret").toString("base64") },
    });
    const expiredToken = makeJwt(Math.floor(Date.now() / 1000) - 10);
    mockFetch.mockResolvedValue(okTokenResponse(expiredToken));

    await credentialsGetAccessToken();
    expect(isCachedTokenValid()).toBe(false);
  });
});

describe("getClientSecretToken", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetCachedToken();
  });

  it("should fetch a token using client secret", async () => {
    mockK8sGet.mockResolvedValue({
      data: { "uds-operator": Buffer.from("my-secret").toString("base64") },
    });
    mockFetch.mockResolvedValue(okTokenResponse("client-secret-token"));

    const token = await getClientSecretToken();

    expect(token).toBe("client-secret-token");
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/realms/uds/protocol/openid-connect/token"),
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("client_secret=my-secret"),
      }),
    );
  });

  it("should throw when the secret key is missing", async () => {
    mockK8sGet.mockResolvedValue({ data: {} });

    await expect(getClientSecretToken()).rejects.toThrow("Missing client secret");
  });

  it("should throw when the K8s secret does not exist", async () => {
    mockK8sGet.mockRejectedValue({ status: 404, message: "Not Found" });

    await expect(getClientSecretToken()).rejects.toThrow("Failed to retrieve secret");
  });

  it("should throw on Keycloak error response", async () => {
    mockK8sGet.mockResolvedValue({
      data: { "uds-operator": Buffer.from("my-secret").toString("base64") },
    });
    mockFetch.mockResolvedValue(errorResponse(401, "Unauthorized"));

    await expect(getClientSecretToken()).rejects.toThrow("401");
  });
});

describe("getSignedJwtToken", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetCachedToken();
  });

  it("should fetch a token using SA JWT assertion", async () => {
    mockFetch.mockResolvedValue(okTokenResponse("signed-jwt-token"));

    const token = await getSignedJwtToken();

    expect(token).toBe("signed-jwt-token");
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/realms/uds/protocol/openid-connect/token"),
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining(
          "client_assertion_type=urn%3Aietf%3Aparams%3Aoauth%3Aclient-assertion-type%3Ajwt-bearer",
        ),
      }),
    );
    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: expect.stringContaining("client_assertion=mock-sa-token"),
      }),
    );
  });

  it("should throw on Keycloak error response", async () => {
    mockFetch.mockResolvedValue(errorResponse(400, "Bad Request"));

    await expect(getSignedJwtToken()).rejects.toThrow("400");
  });

  it("should throw when SA token file is missing", async () => {
    vi.mocked(fs.promises.readFile).mockRejectedValueOnce(
      new Error("ENOENT: no such file or directory"),
    );

    await expect(getSignedJwtToken()).rejects.toThrow("Failed to read service account token");
  });
});

describe("credentialsGetAccessToken", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetCachedToken();
  });

  it("should return cached token when valid", async () => {
    UDSConfig.keycloakClientMode = KeycloakClientMode.CLIENT_SECRET;
    mockK8sGet.mockResolvedValue({
      data: { "uds-operator": Buffer.from("s").toString("base64") },
    });
    const validToken = makeJwt(Math.floor(Date.now() / 1000) + 3600);
    mockFetch.mockResolvedValue(okTokenResponse(validToken));

    const first = await credentialsGetAccessToken();
    const second = await credentialsGetAccessToken();

    expect(first).toBe(second);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("should coalesce concurrent token refreshes", async () => {
    UDSConfig.keycloakClientMode = KeycloakClientMode.CLIENT_SECRET;
    mockK8sGet.mockResolvedValue({
      data: { "uds-operator": Buffer.from("s").toString("base64") },
    });
    const validToken = makeJwt(Math.floor(Date.now() / 1000) + 3600);
    mockFetch.mockResolvedValue(okTokenResponse(validToken));

    const [first, second, third] = await Promise.all([
      credentialsGetAccessToken(),
      credentialsGetAccessToken(),
      credentialsGetAccessToken(),
    ]);

    expect(first).toBe(second);
    expect(second).toBe(third);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  describe("CLIENT_SECRET mode", () => {
    beforeEach(() => {
      UDSConfig.keycloakClientMode = KeycloakClientMode.CLIENT_SECRET;
    });

    it("should use client secret authentication", async () => {
      mockK8sGet.mockResolvedValue({
        data: { "uds-operator": Buffer.from("secret").toString("base64") },
      });
      mockFetch.mockResolvedValue(okTokenResponse("cs-token"));

      const token = await credentialsGetAccessToken();

      expect(token).toBe("cs-token");
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining("client_secret=secret"),
        }),
      );
    });
  });

  describe("SIGNED_JWT mode", () => {
    beforeEach(() => {
      UDSConfig.keycloakClientMode = KeycloakClientMode.SIGNED_JWT;
    });

    it("should use signed JWT authentication", async () => {
      mockFetch.mockResolvedValue(okTokenResponse("jwt-token"));

      const token = await credentialsGetAccessToken();

      expect(token).toBe("jwt-token");
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining("client_assertion=mock-sa-token"),
        }),
      );
    });

    it("should not fall back on failure", async () => {
      mockFetch.mockResolvedValue(errorResponse(401, "Unauthorized"));

      await expect(credentialsGetAccessToken()).rejects.toThrow("401");
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("should not fall back when SA token file is missing", async () => {
      vi.mocked(fs.promises.readFile).mockRejectedValueOnce(
        new Error("ENOENT: no such file or directory"),
      );

      await expect(credentialsGetAccessToken()).rejects.toThrow(
        "Failed to read service account token",
      );
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe("AUTO mode", () => {
    beforeEach(() => {
      UDSConfig.keycloakClientMode = KeycloakClientMode.AUTO;
    });

    it("should use signed JWT when it succeeds", async () => {
      mockFetch.mockResolvedValue(okTokenResponse("auto-jwt-token"));

      const token = await credentialsGetAccessToken();

      expect(token).toBe("auto-jwt-token");
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining("client_assertion=mock-sa-token"),
        }),
      );
    });

    it("should fall back to client secret when signed JWT fails", async () => {
      mockFetch
        .mockResolvedValueOnce(errorResponse(400, "Bad Request"))
        .mockResolvedValueOnce(okTokenResponse("auto-cs-token"));
      mockK8sGet.mockResolvedValue({
        data: { "uds-operator": Buffer.from("secret").toString("base64") },
      });

      const token = await credentialsGetAccessToken();

      expect(token).toBe("auto-cs-token");
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("should fall back to client secret when SA token file is missing", async () => {
      vi.mocked(fs.promises.readFile).mockRejectedValueOnce(
        new Error("ENOENT: no such file or directory"),
      );
      mockK8sGet.mockResolvedValue({
        data: { "uds-operator": Buffer.from("secret").toString("base64") },
      });
      mockFetch.mockResolvedValue(okTokenResponse("fallback-token"));

      const token = await credentialsGetAccessToken();

      expect(token).toBe("fallback-token");
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining("client_secret=secret"),
        }),
      );
    });

    it("should throw when both methods fail", async () => {
      mockFetch
        .mockResolvedValueOnce(errorResponse(400, "Bad Request"))
        .mockResolvedValueOnce(errorResponse(401, "Unauthorized"));
      mockK8sGet.mockResolvedValue({
        data: { "uds-operator": Buffer.from("secret").toString("base64") },
      });

      await expect(credentialsGetAccessToken()).rejects.toThrow("401");
    });
  });
});
