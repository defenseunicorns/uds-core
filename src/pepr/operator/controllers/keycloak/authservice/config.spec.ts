import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { UDSConfig } from "../../../../config";
import { buildInitialSecret, debounceUpdate, operatorConfig } from "./config";
import { AuthserviceConfig } from "./types";

describe("Debounce Functionality Tests", () => {
  beforeEach(() => {
    jest.clearAllTimers();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("should only call the debounced function once within the interval", async () => {
    const mockUpdateFn = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);

    // Call debounceUpdate multiple times within a short period
    debounceUpdate(mockUpdateFn, 3000);
    debounceUpdate(mockUpdateFn, 3000);
    debounceUpdate(mockUpdateFn, 3000);

    jest.runAllTimers();
    await Promise.resolve();

    // Ensure the mock function was called only once
    expect(mockUpdateFn).toHaveBeenCalledTimes(1);
  });

  it("should reset the debounce state after the interval", async () => {
    const mockUpdateFn = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);

    // Call debounceUpdate once
    debounceUpdate(mockUpdateFn, 3000);

    jest.runAllTimers();
    await Promise.resolve();

    // Ensure the mock function was called
    expect(mockUpdateFn).toHaveBeenCalledTimes(1);

    // Call debounceUpdate again after the interval
    debounceUpdate(mockUpdateFn, 3000);
    jest.runAllTimers();
    await Promise.resolve();

    // Ensure the mock function was called a second time
    expect(mockUpdateFn).toHaveBeenCalledTimes(2);
  });

  it("should handle errors and reset debounce state correctly", async () => {
    const mockUpdateFn = jest
      .fn<() => Promise<void>>()
      .mockRejectedValue(new Error("Update failed"));

    // Call debounceUpdate once
    debounceUpdate(mockUpdateFn, 3000);

    jest.runAllTimers();
    await Promise.resolve();

    // Ensure the mock function was called
    expect(mockUpdateFn).toHaveBeenCalledTimes(1);
  });
});

describe("Build Initial Secret Functionality Tests", () => {
  it("should build the initial authservice secret correctly", () => {
    const secret: AuthserviceConfig = buildInitialSecret();

    // Validate the structure of the initial secret
    expect(secret.allow_unmatched_requests).toBe(false);
    expect(secret.listen_address).toBe("0.0.0.0");
    expect(secret.listen_port).toBe("10003");
    expect(secret.log_level).toBe("info");

    // Validate default_oidc_config structure
    expect(secret.default_oidc_config.authorization_uri).toBe(
      `https://sso.${UDSConfig.domain}/realms/${operatorConfig.realm}/protocol/openid-connect/auth`,
    );
  });
});
