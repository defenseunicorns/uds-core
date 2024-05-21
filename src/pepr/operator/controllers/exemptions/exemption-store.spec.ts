import { beforeEach, describe, expect, it } from "@jest/globals";
import { Matcher, MatcherKind, Policy } from "../../crd";
import { addExemption, deleteExemption, getByPolicy, initPolicyMap } from "./exemption-store";

const enforcerMatcher = {
  namespace: "neuvector",
  name: "^neuvector-enforcer-pod.*",
  kind: MatcherKind.Pod,
};

const controllerMatcher = {
  namespace: "neuvector",
  name: "^neuvector-controller-pod.*",
  kind: MatcherKind.Pod,
};

const getExemption = (uid: string, matcher: Matcher, policies: Policy[]) => {
  return {
    metadata: {
      uid,
    },
    spec: {
      exemptions: [
        {
          matcher,
          policies,
        },
      ],
    },
  };
};

describe("Exemption Store", () => {
  beforeEach(() => {
    initPolicyMap();
  });

  it("Add exemption", async () => {
    const e = getExemption("uid", enforcerMatcher, [Policy.DisallowPrivileged]);
    addExemption(e);
    const matchers = getByPolicy(Policy.DisallowPrivileged);

    expect(matchers).toHaveLength(1);
  });

  it("Delete exemption", async () => {
    const e = getExemption("uid", enforcerMatcher, [Policy.DisallowPrivileged]);
    addExemption(e);
    let matchers = getByPolicy(Policy.DisallowPrivileged);
    expect(matchers).toHaveLength(1);
    deleteExemption(e);

    matchers = getByPolicy(Policy.DisallowPrivileged);
    expect(matchers).toHaveLength(0);
  });

  it("Update exemption", async () => {
    const enforcerException = getExemption("uid", enforcerMatcher, [Policy.DisallowPrivileged]);
    addExemption(enforcerException);

    let matchers = getByPolicy(Policy.DisallowPrivileged);
    expect(matchers).toHaveLength(1);

    const controllerExemption = getExemption("uid", controllerMatcher, [Policy.RequireNonRootUser]);
    addExemption(controllerExemption);

    matchers = getByPolicy(Policy.DisallowPrivileged);
    expect(matchers).toHaveLength(0);
  });

  it("Add multiple policies", async () => {
    const enforcerException = getExemption("foo", enforcerMatcher, [Policy.DisallowPrivileged]);
    addExemption(enforcerException);

    let matchers = getByPolicy(Policy.DisallowPrivileged);
    expect(matchers).toHaveLength(1);

    const controllerExemption = getExemption("bar", controllerMatcher, [Policy.RequireNonRootUser]);
    addExemption(controllerExemption);

    matchers = getByPolicy(Policy.DisallowPrivileged);
    expect(matchers).toHaveLength(1);

    matchers = getByPolicy(Policy.RequireNonRootUser);
    expect(matchers).toHaveLength(1);
  });

  it("Add duplicate exemptions owned by different owners", async () => {
    const enforcerException = getExemption("foo", enforcerMatcher, [Policy.DisallowPrivileged]);
    const otherEnforcerException = getExemption("bar", enforcerMatcher, [
      Policy.DisallowPrivileged,
    ]);
    addExemption(enforcerException);
    addExemption(otherEnforcerException);

    const matchers = getByPolicy(Policy.DisallowPrivileged);
    expect(matchers).toHaveLength(2);
  });
});
