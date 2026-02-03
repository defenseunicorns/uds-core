/**
 * Copyright 2024 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import { K8s, kind } from "pepr";
import { afterEach, beforeEach, describe, expect, it, Mock, vi } from "vitest";
import {
  buildInitialSecret,
  getAuthserviceConfig,
  setupAuthserviceSecret,
  updateAuthServiceSecret,
} from "./config.js";
import { AuthserviceConfig } from "./types.js";

const getChain = (name: string) => {
  return {
    name: name,
    match: {
      header: ":authority",
      prefix: "cow.uds.dev",
    },
    filters: [
      {
        oidc_override: {
          authorization_uri: "https://sso.uds.dev/realms/uds/protocol/openid-connect/auth",
          token_uri: "https://sso.uds.dev/realms/uds/protocol/openid-connect/token",
          callback_uri: `https://${name}.uds.dev/login`,
          client_id: name,
          client_secret: "notsecret",
          scopes: [],
          logout: {
            path: "/local",
            redirect_uri: "https://sso.uds.dev/realms/uds/protocol/openid-connect/token/logout",
          },
          cookie_name_prefix: name,
        },
      },
    ],
  };
};

const getConfig = () => {
  return {
    allow_unmatched_requests: true,
    listen_address: "127.0.0.1",
    listen_port: "8080",
    log_level: "debug",
    default_oidc_config: {
      client_id: "new-client",
      client_secret: "new-secret",
      authorization_uri: "",
      token_uri: "",
      logout: {
        path: "/logout",
        redirect_uri: "/logout-redirect",
      },
      scopes: [],
    },
    threads: 4,
    chains: [
      {
        name: "cow",
        match: {
          header: ":authority",
          prefix: "cow.uds.dev",
        },
        filters: [
          {
            oidc_override: {
              authorization_uri: "https://sso.uds.dev/realms/uds/protocol/openid-connect/auth",
              token_uri: "https://sso.uds.dev/realms/uds/protocol/openid-connect/token",
              callback_uri: "https://cow.uds.dev/login",
              client_id: "bear",
              client_secret: "notsecret",
              scopes: [],
              logout: {
                path: "/local",
                redirect_uri: "https://sso.uds.dev/realms/uds/protocol/openid-connect/token/logout",
              },
              cookie_name_prefix: "cow",
            },
          },
        ],
      },
    ],
  } as AuthserviceConfig;
};

// Mock the necessary Kubernetes functions
vi.mock("pepr", () => ({
  K8s: vi.fn(),
  Log: {
    child: vi.fn(() => ({
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      level: "info",
    })),
  },
  kind: {
    Secret: "Secret",
    Namespace: "Namespace",
    Deployment: "Deployment",
  },
}));

describe("AuthService Config Tests", () => {
  const applyMock = vi
    .fn<(s: kind.Secret) => Promise<kind.Secret>>()
    .mockImplementation((s: kind.Secret) =>
      Promise.resolve({
        metadata: { name: "authservice-uds" },
        data: {
          "config.json": s.data!["config.json"],
        },
      }),
    );

  beforeEach(() => {
    process.env.PEPR_WATCH_MODE = "true";
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("buildInitialSecret should return the correct initial secret", () => {
    const secret = buildInitialSecret();
    expect(secret).toEqual({
      allow_unmatched_requests: false,
      listen_address: "0.0.0.0",
      listen_port: "10003",
      log_level: "info",
      default_oidc_config: expect.objectContaining({
        authorization_uri: expect.stringContaining("sso."),
        client_id: "global_id",
        client_secret: "global_secret",
        jwks_fetcher: expect.any(Object),
        trusted_certificate_authority: expect.any(String),
      }),
      threads: 8,
      chains: expect.any(Array),
    });
  });

  it("setupAuthserviceSecret should skip creation if secret exists", async () => {
    const getMock = vi.fn<() => Promise<kind.Secret>>().mockResolvedValue({
      metadata: { name: "authservice-uds" },
      data: {
        "config.json": btoa(JSON.stringify(getConfig())),
      },
    });

    (K8s as Mock).mockImplementation(kindType => {
      if (kindType === kind.Secret) {
        return {
          Apply: applyMock,
          InNamespace: vi.fn().mockReturnThis(),
          Get: getMock,
        };
      } else {
        return {
          Apply: vi.fn(),
        };
      }
    });

    await setupAuthserviceSecret();

    expect(applyMock).toHaveBeenCalledTimes(0); // Apply should be called once
    expect(getMock).toHaveBeenCalledTimes(1); // Get should be called once
  });

  it("updateAuthServiceSecret should debounce and update the Kubernetes secret", async () => {
    vi.useFakeTimers();

    const patchMock = vi.fn(); // Mock the Patch method

    (K8s as Mock).mockImplementation(kindType => {
      if (kindType === kind.Secret) {
        return {
          Apply: applyMock,
        };
      }
      if (kindType === kind.Deployment) {
        return {
          Patch: patchMock, // Mock the Patch function for Deployment
        };
      }
    });

    const newConfig: AuthserviceConfig = getConfig();

    const updatePromise = updateAuthServiceSecret(newConfig);

    vi.advanceTimersByTime(12000);

    await updatePromise;

    expect(applyMock).toHaveBeenCalledTimes(1); // Ensure Apply is called once
    expect(patchMock).toHaveBeenCalledTimes(1); // Ensure Patch is called once for the checksum
  });

  it("updateAuthServiceSecret should only apply changes after debounce delay", async () => {
    vi.useFakeTimers();

    const patchMock = vi.fn(); // Mock Patch for Deployment

    // Mock K8s functionality for Secret and Deployment
    (K8s as Mock).mockImplementation(kindType => {
      if (kindType === "Secret") {
        return {
          Apply: applyMock,
        };
      }
      if (kindType === "Deployment") {
        return {
          Patch: patchMock, // Mock Patch for Deployment
        };
      }
    });

    const newConfig: AuthserviceConfig = getConfig();

    const updatePromise = updateAuthServiceSecret(newConfig); // Capture the promise to ensure it's awaited later

    vi.advanceTimersByTime(2000); // Fast-forward time

    await updatePromise; // Ensure the promise is awaited after the debounce

    expect(applyMock).toHaveBeenCalledTimes(1); // Ensure Apply is called once
    expect(patchMock).toHaveBeenCalledTimes(1); // Ensure Patch is called for the deployment
  });

  it("updateAuthServiceSecret should only applied if called once between debounce delay", async () => {
    vi.useFakeTimers();

    const patchMock = vi.fn(); // Mock Patch for Deployment

    // Mock K8s functionality for Secret and Deployment
    (K8s as Mock).mockImplementation(kindType => {
      if (kindType === "Secret") {
        return {
          Apply: applyMock,
        };
      }
      if (kindType === "Deployment") {
        return {
          Patch: patchMock, // Mock Patch for Deployment
        };
      }
    });

    // add a client simulating a new Package named cow
    const baseConfig: AuthserviceConfig = getConfig();
    const cowChain = getChain("cow");
    baseConfig.chains.push(cowChain);

    const updatePromise = updateAuthServiceSecret(baseConfig); // Capture the promise to ensure it's awaited later

    // add a client simulating a new Package being added within debounce delay
    const updatedConfig = getConfig();
    const bearChain = getChain("bear");
    updatedConfig.chains.push(bearChain);

    const otherPromise = updateAuthServiceSecret(updatedConfig); // Capture the promise to ensure it's awaited later

    vi.advanceTimersByTime(2000); // Fast-forward time

    await updatePromise;
    await otherPromise;

    // ensure applyMock has been called with particular config
    applyMock.mock.calls.forEach(call => {
      if (call.length > 0) {
        const config = call.at(0) as unknown as { data: { "config.json": string } };
        const configDecoded = JSON.parse(
          atob(config!.data["config.json"]),
        ) as unknown as AuthserviceConfig;
        expect(configDecoded.chains.length).toEqual(2);
      }
    });
    expect(applyMock).toHaveBeenCalledTimes(1);
    expect(patchMock).toHaveBeenCalledTimes(1); // Ensure Patch is called for the deployment
  });

  it("updateAuthServiceSecret should reset secret on failure", async () => {
    vi.useFakeTimers();

    const patchMock = vi.fn(); // Mock Patch for Deployment

    (K8s as Mock).mockImplementation(kindType => {
      if (kindType === kind.Secret) {
        return {
          Apply: applyMock,
        };
      }
      if (kindType === kind.Deployment) {
        return {
          Patch: patchMock, // Mock the Patch function for Deployment
        };
      }
    });

    // add a client simulating a new Package named cow
    const baseConfig: AuthserviceConfig = getConfig();
    const bearChain = getChain("bear");
    baseConfig.chains.push(bearChain);

    const updatePromise = updateAuthServiceSecret(baseConfig); // Capture the promise to ensure it's awaited later

    vi.advanceTimersByTime(2000); // Fast-forward time
    await updatePromise;

    // ensure applyMock has been called with particular config
    applyMock.mock.calls.forEach(call => {
      if (call.length > 0) {
        const config = call.at(0) as unknown as { data: { "config.json": string } };
        const configDecoded = JSON.parse(
          atob(config!.data["config.json"]),
        ) as unknown as AuthserviceConfig;
        expect(configDecoded.chains.length).toEqual(2);
      }
    });
    expect(applyMock).toHaveBeenCalledTimes(1);
    expect(patchMock).toHaveBeenCalledTimes(1); // Ensure Patch is called for the deployment

    (K8s as Mock).mockImplementationOnce(kindType => {
      if (kindType === kind.Secret) {
        return {
          Apply: () => Promise.reject(new Error("Failed to apply secret")),
        };
      }
    });

    // add a client simulating a new Package named cow
    const frogChain = getChain("frog");
    baseConfig.chains.push(frogChain);

    const failedUpdate = updateAuthServiceSecret(baseConfig); // Capture the promise to ensure it's awaited later

    vi.advanceTimersByTime(2000); // Fast-forward time

    failedUpdate
      .then(config => {
        expect(config).toEqual(false);
      })
      .catch(async () => {
        const fallbackConfig = await getAuthserviceConfig();
        expect(fallbackConfig.chains.length).toEqual(2);
      });
  });
});
