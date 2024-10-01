import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { K8s, kind } from "pepr";
import { buildInitialSecret, setupAuthserviceSecret, updateAuthServiceSecret } from "./config";
import { AuthserviceConfig } from "./types";

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
jest.mock("pepr", () => ({
  K8s: jest.fn(),
  Log: {
    child: jest.fn(() => ({
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      level: "info",
    })),
  },
  kind: {
    Secret: "Secret",
    Namespace: "Namespace",
    Deployment: "Deployment",
  },
}));

interface SecretMetadata {
  metadata: {
    name: string;
  };
}

describe("AuthService Config Tests", () => {
  beforeEach(() => {
    process.env.PEPR_WATCH_MODE = "true";
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    jest.clearAllMocks();
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
    const applyMock = jest.fn();
    const getMock = jest.fn<() => Promise<SecretMetadata>>().mockResolvedValue({
      metadata: { name: "authservice-uds" },
    });

    (K8s as jest.Mock).mockReturnValue({
      Apply: applyMock,
      InNamespace: jest.fn().mockReturnThis(),
      Get: getMock,
    });

    await setupAuthserviceSecret();

    expect(applyMock).toHaveBeenCalledTimes(1); // Apply should be called once
    expect(getMock).toHaveBeenCalledTimes(1); // Get should be called once
  });

  it("updateAuthServiceSecret should debounce and update the Kubernetes secret", async () => {
    jest.useFakeTimers();

    const applyMock = jest.fn<() => Promise<SecretMetadata>>().mockResolvedValue({
      metadata: { name: "authservice-uds" },
    });

    const patchMock = jest.fn(); // Mock the Patch method

    (K8s as jest.Mock).mockImplementation(kindType => {
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

    jest.advanceTimersByTime(12000);

    await updatePromise;

    expect(applyMock).toHaveBeenCalledTimes(1); // Ensure Apply is called once
    expect(patchMock).toHaveBeenCalledTimes(1); // Ensure Patch is called once for the checksum
  });

  it("updateAuthServiceSecret should only apply changes after debounce delay", async () => {
    jest.useFakeTimers();

    const applyMock = jest.fn<() => Promise<SecretMetadata>>().mockResolvedValue({
      metadata: { name: "authservice-uds" },
    });

    const patchMock = jest.fn(); // Mock Patch for Deployment

    // Mock K8s functionality for Secret and Deployment
    (K8s as jest.Mock).mockImplementation(kindType => {
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

    jest.advanceTimersByTime(12000); // Fast-forward time

    await updatePromise; // Ensure the promise is awaited after the debounce

    expect(applyMock).toHaveBeenCalledTimes(1); // Ensure Apply is called once
    expect(patchMock).toHaveBeenCalledTimes(1); // Ensure Patch is called for the deployment
  });

  it("updateAuthServiceSecret should only applied if called once between debounce delay", async () => {
    jest.useFakeTimers();

    const applyMock = jest.fn<() => Promise<SecretMetadata>>().mockResolvedValue({
      metadata: { name: "authservice-uds" },
    });

    const patchMock = jest.fn(); // Mock Patch for Deployment

    // Mock K8s functionality for Secret and Deployment
    (K8s as jest.Mock).mockImplementation(kindType => {
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
    const cowChain = getChain("cow");
    newConfig.chains.push(cowChain);

    const updatePromise = updateAuthServiceSecret(newConfig); // Capture the promise to ensure it's awaited later

    // add a client simulating a new Package
    const updatedConfig = getConfig();
    const bearChain = getChain("bear");
    updatedConfig.chains.push(bearChain);

    const otherPromise = updateAuthServiceSecret(updatedConfig); // Capture the promise to ensure it's awaited later

    jest.advanceTimersByTime(2000); // Fast-forward time

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
});
