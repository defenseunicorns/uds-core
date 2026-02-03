/**
 * Copyright 2025 Defense Unicorns
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
 */

import {
  V1Container,
  V1ObjectMeta,
  V1PodSecurityContext,
  V1PodSpec,
} from "@kubernetes/client-node";
import { describe, expect, it } from "vitest";
import { Ctx } from "./common.js";
import {
  findContainersWithoutDropAllCapability,
  isRootSecurityContext,
  setAllContainersDropAllCapabilities,
  setNonRootUserSettings,
  setPrivilegeEscalation,
  validateContainerCapabilities,
  validatePrivilegeEscalation,
  validateProcMount,
  validateSeccompProfile,
  validateSELinuxOptions,
  validateSELinuxTypes,
} from "./security.js";

describe("setPrivilegeEscalation", () => {
  const ape = (c: V1Container) => c.securityContext?.allowPrivilegeEscalation;

  it("sets allowPrivilegeEscalation=false when undefined, not privileged, and no SYS_ADMIN capability", () => {
    const containers: V1Container[] = [
      { name: "ok-no-sc" }, // no securityContext at all
      {
        name: "ok-basic",
        securityContext: { allowPrivilegeEscalation: undefined, privileged: false },
      },
      {
        name: "ok-cap",
        securityContext: {
          allowPrivilegeEscalation: undefined,
          privileged: false,
          capabilities: { add: ["NET_ADMIN"] },
        },
      },
    ];

    const changed = setPrivilegeEscalation(containers);

    expect(changed).toBe(true);
    expect(ape(containers[0])).toBe(false);
    expect(ape(containers[1])).toBe(false);
    expect(ape(containers[2])).toBe(false);
    // ensure we didn't alter unrelated fields
    expect(containers[2].securityContext?.capabilities?.add).toEqual(["NET_ADMIN"]);
  });

  it("does not modify containers when allowPrivilegeEscalation is already set (true or false)", () => {
    const containers: V1Container[] = [
      {
        name: "already-true",
        securityContext: { allowPrivilegeEscalation: true, privileged: false },
      },
      {
        name: "already-false",
        securityContext: { allowPrivilegeEscalation: false, privileged: false },
      },
    ];

    const changed = setPrivilegeEscalation(containers);

    expect(changed).toBe(false);
    expect(ape(containers[0])).toBe(true);
    expect(ape(containers[1])).toBe(false);
  });

  it("skips privileged containers", () => {
    const containers: V1Container[] = [
      { name: "priv", securityContext: { allowPrivilegeEscalation: undefined, privileged: true } },
    ];

    const changed = setPrivilegeEscalation(containers);

    expect(changed).toBe(false);
    expect(ape(containers[0])).toBeUndefined();
  });

  it("skips containers that add SYS_ADMIN capability", () => {
    const containers: V1Container[] = [
      {
        name: "cap-prefixed",
        securityContext: {
          allowPrivilegeEscalation: undefined,
          privileged: false,
          capabilities: { add: ["CAP_SYS_ADMIN"] },
        },
      },
    ];

    const changed = setPrivilegeEscalation(containers);

    expect(changed).toBe(false);
    expect(ape(containers[0])).toBeUndefined();
  });

  it("treats empty or undefined capabilities.add as eligible for setting APE=false", () => {
    const containers: V1Container[] = [
      {
        name: "no-capabilities",
        securityContext: { allowPrivilegeEscalation: undefined, privileged: false },
      },
      {
        name: "empty-add",
        securityContext: {
          allowPrivilegeEscalation: undefined,
          privileged: false,
          capabilities: { add: [] },
        },
      },
    ];

    const changed = setPrivilegeEscalation(containers);

    expect(changed).toBe(true);
    expect(ape(containers[0])).toBe(false);
    expect(ape(containers[1])).toBe(false);
  });

  it("handles multiple containers and returns true if any were changed", () => {
    const containers: V1Container[] = [
      {
        name: "changed",
        securityContext: { allowPrivilegeEscalation: undefined, privileged: false },
      }, // should change
      { name: "unchanged", securityContext: { allowPrivilegeEscalation: true, privileged: false } }, // should remain true
    ];

    const changed = setPrivilegeEscalation(containers);

    expect(changed).toBe(true);
    expect(ape(containers[0])).toBe(false);
    expect(ape(containers[1])).toBe(true);
  });

  it("is idempotent: second call returns false and leaves values as-is", () => {
    const containers: V1Container[] = [
      {
        name: "idemp",
        securityContext: { allowPrivilegeEscalation: undefined, privileged: false },
      },
    ];

    const first = setPrivilegeEscalation(containers);
    const snapshot = JSON.parse(JSON.stringify(containers));
    const second = setPrivilegeEscalation(containers);

    expect(first).toBe(true);
    expect(second).toBe(false);
    expect(containers).toEqual(snapshot);
  });
});

describe("validatePrivilegeEscalation", () => {
  const names = (xs: Ctx[]) => xs.map(x => x.name).sort();

  it("flags containers when allowPrivilegeEscalation is true OR privileged is true", () => {
    const containers: Ctx[] = [
      { name: "ape-true", ctx: { allowPrivilegeEscalation: true } },
      { name: "priv-true", ctx: { allowPrivilegeEscalation: false, privileged: true } },
      { name: "ok", ctx: { allowPrivilegeEscalation: false, privileged: false } },
    ];

    const res = validatePrivilegeEscalation(containers);
    expect(names(res)).toEqual(["ape-true", "priv-true"]);
  });

  it("treats undefined allowPrivilegeEscalation as a violation (documents current behavior)", () => {
    const containers: Ctx[] = [
      { name: "undef-ape", ctx: { privileged: false } }, // ape undefined -> treated as violating
      { name: "ok", ctx: { allowPrivilegeEscalation: false, privileged: false } },
    ];

    const res = validatePrivilegeEscalation(containers);
    expect(names(res)).toEqual(["undef-ape"]);
  });

  it("returns empty when all containers have allowPrivilegeEscalation=false and privileged=false", () => {
    const containers: Ctx[] = [
      { name: "c1", ctx: { allowPrivilegeEscalation: false, privileged: false } },
      { name: "c2", ctx: { allowPrivilegeEscalation: false } }, // privileged defaults undefined/false
    ];

    const res = validatePrivilegeEscalation(containers);
    expect(res).toHaveLength(0);
  });

  it("does not mutate inputs (pure filter)", () => {
    const one: Ctx = { name: "ape-true", ctx: { allowPrivilegeEscalation: true } };
    const arr: Ctx[] = [one];

    const res = validatePrivilegeEscalation(arr);
    expect(names(res)).toEqual(["ape-true"]);
    // references unchanged
    expect(arr[0]).toBe(one);
    expect(res[0]).toBe(one);
  });

  it("handles empty container list", () => {
    expect(validatePrivilegeEscalation([])).toEqual([]);
  });
});

describe("setNonRootUserSettings", () => {
  const expectDefaults = (pod: V1PodSpec) => {
    expect(pod.securityContext?.runAsNonRoot).toBe(true);
    expect(pod.securityContext?.runAsUser).toBe(1000);
    expect(pod.securityContext?.runAsGroup).toBe(1000);
  };

  const expectNaN3 = (u: unknown, g: unknown, f: unknown) => {
    expect(Number.isNaN(u as number)).toBe(true);
    expect(Number.isNaN(g as number)).toBe(true);
    expect(Number.isNaN(f as number)).toBe(true);
  };

  it("initializes securityContext if missing and applies defaults", () => {
    const pod: V1PodSpec = { containers: [] }; // securityContext: undefined
    setNonRootUserSettings(pod, { name: "test" });
    expect(pod.securityContext).toBeDefined();
    expectDefaults(pod);
    expect(pod.securityContext?.fsGroup).toBeUndefined();

    const pod2: V1PodSpec = { containers: [], securityContext: {} }; // securityContext: {}
    setNonRootUserSettings(pod2, { name: "test" });
    expectDefaults(pod2);
  });

  it("does not override existing runAsNonRoot if already set", () => {
    const podTrue: V1PodSpec = { containers: [], securityContext: { runAsNonRoot: true } };
    const podFalse: V1PodSpec = { containers: [], securityContext: { runAsNonRoot: false } };

    setNonRootUserSettings(podTrue, { name: "test" });
    setNonRootUserSettings(podFalse, { name: "test" });

    expect(podTrue.securityContext?.runAsNonRoot).toBe(true);
    expect(podFalse.securityContext?.runAsNonRoot).toBe(false);
  });

  it("does not override existing runAsUser/runAsGroup when no labels provided", () => {
    const pod: V1PodSpec = {
      containers: [],
      securityContext: { runAsUser: 1234, runAsGroup: 2345 },
    };
    setNonRootUserSettings(pod, { name: "test" });

    expect(pod.securityContext?.runAsUser).toBe(1234);
    expect(pod.securityContext?.runAsGroup).toBe(2345);
  });

  it("uses uds/user and uds/group labels instead of defaults; sets runAsNonRoot true if unset", () => {
    const pod: V1PodSpec = { containers: [] };
    const meta: V1ObjectMeta = {
      name: "test",
      labels: { "uds/user": "2001", "uds/group": "2002" },
    };

    setNonRootUserSettings(pod, meta);

    expect(pod.securityContext?.runAsUser).toBe(2001);
    expect(pod.securityContext?.runAsGroup).toBe(2002);
    expect(pod.securityContext?.runAsNonRoot).toBe(true);
  });

  it("sets fsGroup when uds/fsgroup label is present", () => {
    const pod: V1PodSpec = { containers: [] };
    setNonRootUserSettings(pod, { name: "test", labels: { "uds/fsgroup": "3003" } });
    expect(pod.securityContext?.fsGroup).toBe(3003);
  });

  it("parseInt behavior: labels with extra text still parse", () => {
    const pod: V1PodSpec = { containers: [] };
    const meta: V1ObjectMeta = {
      name: "test",
      labels: { "uds/user": "1000abc", "uds/group": "2000xyz", "uds/fsgroup": "3000q" },
    };

    setNonRootUserSettings(pod, meta);

    expect(pod.securityContext?.runAsUser).toBe(1000);
    expect(pod.securityContext?.runAsGroup).toBe(2000);
    expect(pod.securityContext?.fsGroup).toBe(3000);
  });

  it("parseInt behavior: non-numeric labels become NaN (documents current behavior)", () => {
    const pod: V1PodSpec = { containers: [] };
    const meta: V1ObjectMeta = {
      name: "test",
      labels: { "uds/user": "abc", "uds/group": "def", "uds/fsgroup": "ghi" },
    };

    setNonRootUserSettings(pod, meta);

    expectNaN3(
      pod.securityContext?.runAsUser,
      pod.securityContext?.runAsGroup,
      pod.securityContext?.fsGroup,
    );
  });

  it("labels override existing values; runAsNonRoot unchanged if set", () => {
    const pod: V1PodSpec = {
      containers: [],
      securityContext: { runAsUser: 1111, runAsGroup: 2222, fsGroup: 3333, runAsNonRoot: false },
    };
    const meta: V1ObjectMeta = {
      name: "test",
      labels: { "uds/user": "4444", "uds/group": "5555", "uds/fsgroup": "6666" },
    };

    setNonRootUserSettings(pod, meta);

    expect(pod.securityContext?.runAsUser).toBe(4444);
    expect(pod.securityContext?.runAsGroup).toBe(5555);
    expect(pod.securityContext?.fsGroup).toBe(6666);
    expect(pod.securityContext?.runAsNonRoot).toBe(false);
  });

  it("is idempotent (calling twice preserves outcomes)", () => {
    const pod: V1PodSpec = { containers: [] };
    const meta: V1ObjectMeta = {
      name: "test",
      labels: { "uds/user": "2001", "uds/group": "2002" },
    };

    setNonRootUserSettings(pod, meta);
    const first = { ...pod.securityContext };
    setNonRootUserSettings(pod, meta);

    expect(pod.securityContext).toEqual(first);
  });
});

describe("isRootSecurityContext", () => {
  it("returns false when context is empty/undefined fields", () => {
    const ctx: Partial<V1PodSecurityContext> = {};
    expect(isRootSecurityContext(ctx)).toBe(false);
  });

  it("returns true when runAsNonRoot is explicitly false", () => {
    const ctx: Partial<V1PodSecurityContext> = { runAsNonRoot: false };
    expect(isRootSecurityContext(ctx)).toBe(true);
  });

  it("returns true when runAsUser is 0", () => {
    const ctx: Partial<V1PodSecurityContext> = { runAsUser: 0 };
    expect(isRootSecurityContext(ctx)).toBe(true);
  });

  it("returns true when supplementalGroups includes 0 (regardless of position)", () => {
    const ctx1: Partial<V1PodSecurityContext> = { supplementalGroups: [0] };
    const ctx2: Partial<V1PodSecurityContext> = { supplementalGroups: [10, 0, 999] };
    expect(isRootSecurityContext(ctx1)).toBe(true);
    expect(isRootSecurityContext(ctx2)).toBe(true);
  });

  it("returns false when runAsNonRoot is true, runAsUser non-zero, and no 0 in supplementalGroups", () => {
    const ctx: Partial<V1PodSecurityContext> = {
      runAsNonRoot: true,
      runAsUser: 1000,
      supplementalGroups: [1, 2, 3],
    };
    expect(isRootSecurityContext(ctx)).toBe(false);
  });

  it("returns false when supplementalGroups is empty or undefined", () => {
    const empty: Partial<V1PodSecurityContext> = { supplementalGroups: [] };
    const undef: Partial<V1PodSecurityContext> = { supplementalGroups: undefined };
    expect(isRootSecurityContext(empty)).toBe(false);
    expect(isRootSecurityContext(undef)).toBe(false);
  });

  it("treats NaN runAsUser as not root (documents current behavior)", () => {
    const ctx: Partial<V1PodSecurityContext> = { runAsUser: Number.NaN };
    expect(isRootSecurityContext(ctx)).toBe(false);
  });
});

describe("validateProcMount", () => {
  const names = (xs: Ctx[]) => xs.map(x => x.name).sort();

  it("returns no violations for containers with no procMount or allowed values", () => {
    const containers: Ctx[] = [
      { name: "noField", ctx: {} }, // no procMount
      { name: "allowed1", ctx: { procMount: "Default" } },
      { name: "allowed2", ctx: { procMount: "Unmasked" } },
    ];

    const result = validateProcMount(containers, ["Default", "Unmasked"]);
    expect(result.isPodViolation).toBe(false);
    expect(result.violations).toHaveLength(0);
  });

  it("returns only the containers that use disallowed procMount values", () => {
    const containers: Ctx[] = [
      { name: "ok1", ctx: { procMount: "Default" } },
      { name: "bad", ctx: { procMount: "BadValue" } },
      { name: "ok2", ctx: {} }, // no procMount → ignored
      { name: "ok3", ctx: { procMount: "Unmasked" } },
    ];

    const result = validateProcMount(containers, ["Default", "Unmasked"]);
    expect(result.isPodViolation).toBe(false);
    expect(names(result.violations)).toEqual(["bad"]);
  });

  it("does not flag containers when procMount is undefined even if undefined is not allowed (documents current behavior)", () => {
    const containers: Ctx[] = [{ name: "u", ctx: { procMount: undefined } }];

    const result = validateProcMount(containers, ["Default"]);
    expect(result.isPodViolation).toBe(false);
    expect(result.violations).toHaveLength(0);
  });

  it("does not mutate inputs", () => {
    const original: Ctx = { name: "bad", ctx: { procMount: "BadValue" } };
    const containers: Ctx[] = [original];

    const result = validateProcMount(containers, ["Default"]);
    expect(names(result.violations)).toEqual(["bad"]);
    // same object references remain
    expect(containers[0]).toBe(original);
    expect(containers[0].ctx).toBe(original.ctx);
  });
});

describe("validateSeccompProfile", () => {
  const expectPodViolationOnly = (res: { isPodViolation: boolean; violations: Ctx[] }) => {
    expect(res.isPodViolation).toBe(true);
    expect(res.violations).toHaveLength(1);
    expect(res.violations[0].name).toBe("pod");
  };

  const expectNoViolations = (res: { isPodViolation: boolean; violations: Ctx[] }) => {
    expect(res.isPodViolation).toBe(false);
    expect(res.violations).toHaveLength(0);
  };

  const names = (xs: Ctx[]) => xs.map(x => x.name).sort();

  // Pod-level
  it("POD violation when pod seccomp type is not allowed", () => {
    const pod: V1PodSecurityContext = { seccompProfile: { type: "Unconfined" } };
    const res = validateSeccompProfile(pod, [], ["RuntimeDefault", "Localhost"]);
    expectPodViolationOnly(res);
  });

  it("POD type undefined: violation unless undefined is explicitly allowed", () => {
    const pod: V1PodSecurityContext = {}; // no seccompProfile.type

    const disallowed = validateSeccompProfile(pod, [], ["RuntimeDefault"]);
    expectPodViolationOnly(disallowed);

    const allowed = validateSeccompProfile(pod, [], ["RuntimeDefault", undefined]);
    expectNoViolations(allowed);
  });

  it("no POD violation when pod seccomp type is allowed", () => {
    const pod: V1PodSecurityContext = { seccompProfile: { type: "RuntimeDefault" } };
    const res = validateSeccompProfile(pod, [], ["RuntimeDefault", "Localhost"]);
    expectNoViolations(res);
  });

  it("treats missing podSecurityContext the same as undefined type (violation)", () => {
    const res = validateSeccompProfile(undefined, [], ["RuntimeDefault"]);
    expectPodViolationOnly(res);
  });

  // Container-level
  it("flags CONTAINER violations for disallowed/undefined types when pod passes", () => {
    const pod: V1PodSecurityContext = { seccompProfile: { type: "RuntimeDefault" } };
    const containers: Ctx[] = [
      { name: "ok", ctx: { seccompProfile: { type: "RuntimeDefault" } } },
      { name: "bad1", ctx: { seccompProfile: { type: "Unconfined" } } },
      { name: "bad2", ctx: {} }, // undefined type -> violation unless undefined allowed
    ];
    const res = validateSeccompProfile(pod, containers, ["RuntimeDefault"]);
    expect(res.isPodViolation).toBe(false);
    expect(names(res.violations)).toEqual(["bad1", "bad2"]);
  });

  it("containers with undefined type are OK when undefined is allowed", () => {
    const pod: V1PodSecurityContext = { seccompProfile: { type: "RuntimeDefault" } };
    const containers: Ctx[] = [
      { name: "ok-undef", ctx: {} },
      { name: "ok", ctx: { seccompProfile: { type: "RuntimeDefault" } } },
    ];
    const res = validateSeccompProfile(pod, containers, ["RuntimeDefault", undefined]);
    expectNoViolations(res);
  });

  it("accepts Localhost when allowed (localhostProfile value not validated)", () => {
    const pod: V1PodSecurityContext = { seccompProfile: { type: "RuntimeDefault" } };
    const containers: Ctx[] = [
      {
        name: "c1",
        ctx: { seccompProfile: { type: "Localhost", localhostProfile: "profiles/my.json" } },
      },
      { name: "c2", ctx: { seccompProfile: { type: "Localhost" } } }, // missing localhostProfile is still allowed
    ];
    const res = validateSeccompProfile(pod, containers, ["RuntimeDefault", "Localhost"]);
    expectNoViolations(res);
  });
});

describe("validateSELinuxOptions", () => {
  const expectPodViolationOnly = (res: { isPodViolation: boolean; violations: Ctx[] }) => {
    expect(res.isPodViolation).toBe(true);
    expect(res.violations).toHaveLength(1);
    expect(res.violations[0].name).toBe("pod");
  };

  const expectNoViolations = (res: { isPodViolation: boolean; violations: Ctx[] }) => {
    expect(res.isPodViolation).toBe(false);
    expect(res.violations).toHaveLength(0);
  };

  const names = (xs: Ctx[]) => xs.map(x => x.name).sort();

  // Pod-level
  it("flags a POD violation when pod seLinuxOptions.user or .role is set", () => {
    const withUser: V1PodSecurityContext = { seLinuxOptions: { user: "system_u" } };
    const withRole: V1PodSecurityContext = { seLinuxOptions: { role: "system_r" } };

    expectPodViolationOnly(validateSELinuxOptions(withUser, []));
    expectPodViolationOnly(validateSELinuxOptions(withRole, []));
  });

  it("does NOT flag a POD violation when user/role are absent (type/level only or undefined)", () => {
    const onlyTypeLevel: V1PodSecurityContext = { seLinuxOptions: { type: "spc_t", level: "s0" } };
    const noSelinux: V1PodSecurityContext = {};

    expectNoViolations(validateSELinuxOptions(onlyTypeLevel, []));
    expectNoViolations(validateSELinuxOptions(noSelinux, []));
  });

  it("short-circuits: pod violation returns only POD and skips container checks", () => {
    const pod: V1PodSecurityContext = { seLinuxOptions: { user: "system_u" } };
    const containers: Ctx[] = [
      { name: "c1", ctx: { seLinuxOptions: { role: "system_r" } } },
      { name: "c2", ctx: {} },
    ];
    expectPodViolationOnly(validateSELinuxOptions(pod, containers));
  });

  // Container-level
  it("flags containers that set user or role; ignores others", () => {
    const pod: V1PodSecurityContext = {};
    const containers: Ctx[] = [
      { name: "ok1", ctx: {} },
      { name: "bad1", ctx: { seLinuxOptions: { user: "system_u" } } },
      { name: "bad2", ctx: { seLinuxOptions: { role: "system_r" } } },
      { name: "ok2", ctx: { seLinuxOptions: { type: "spc_t", level: "s0" } } },
    ];

    const res = validateSELinuxOptions(pod, containers);
    expect(res.isPodViolation).toBe(false);
    expect(names(res.violations)).toEqual(["bad1", "bad2"]);
  });

  it("containers with undefined seLinuxOptions do not violate", () => {
    const pod: V1PodSecurityContext = {};
    const containers: Ctx[] = [
      { name: "c1", ctx: {} },
      { name: "c2", ctx: { seLinuxOptions: undefined } },
    ];

    const res = validateSELinuxOptions(pod, containers);
    expectNoViolations(res);
  });
});

describe("validateSELinuxTypes", () => {
  const expectPodViolationOnly = (res: { isPodViolation: boolean; violations: Ctx[] }) => {
    expect(res.isPodViolation).toBe(true);
    expect(res.violations).toHaveLength(1);
    expect(res.violations[0].name).toBe("pod");
  };

  const expectNoViolations = (res: { isPodViolation: boolean; violations: Ctx[] }) => {
    expect(res.isPodViolation).toBe(false);
    expect(res.violations).toHaveLength(0);
  };

  // Pod-level behavior
  it("flags a POD violation when pod type is not in allowed list", () => {
    const pod: V1PodSecurityContext = { seLinuxOptions: { type: "spc_t" } };
    const res = validateSELinuxTypes(pod, [], ["container_t"]);
    expectPodViolationOnly(res);
  });

  it("does NOT flag a POD violation when pod type is allowed", () => {
    const pod: V1PodSecurityContext = { seLinuxOptions: { type: "container_t" } };
    const res = validateSELinuxTypes(pod, [], ["container_t"]);
    expectNoViolations(res);
  });

  it("treats missing type as a violation unless undefined is explicitly allowed", () => {
    const pod: V1PodSecurityContext = {};
    const disallowed = validateSELinuxTypes(pod, [], ["container_t"]);
    expectPodViolationOnly(disallowed);

    const allowed = validateSELinuxTypes(pod, [], ["container_t", undefined]);
    expectNoViolations(allowed);
  });

  it("when podSecurityContext is undefined, behaves like missing type (violation)", () => {
    const res = validateSELinuxTypes(undefined, [], ["container_t"]);
    expectPodViolationOnly(res);
  });

  // Container-level behavior
  it("flags containers with disallowed or missing types", () => {
    const pod: V1PodSecurityContext = { seLinuxOptions: { type: "container_t" } };
    const containers: Ctx[] = [
      { name: "ok", ctx: { seLinuxOptions: { type: "container_t" } } },
      { name: "bad1", ctx: { seLinuxOptions: { type: "spc_t" } } },
      { name: "bad2", ctx: {} },
    ];

    const res = validateSELinuxTypes(pod, containers, ["container_t"]);
    expect(res.isPodViolation).toBe(false);
    expect(res.violations.map(v => v.name).sort()).toEqual(["bad1", "bad2"]);
  });

  it("ignores containers with missing type when undefined is allowed", () => {
    const pod: V1PodSecurityContext = { seLinuxOptions: { type: "container_t" } };
    const containers: Ctx[] = [
      { name: "ok1", ctx: {} },
      { name: "ok2", ctx: { seLinuxOptions: { type: "container_t" } } },
    ];

    const res = validateSELinuxTypes(pod, containers, ["container_t", undefined]);
    expectNoViolations(res);
  });
});

describe("setAllContainersDropAllCapabilities", () => {
  it("forces drop: ['ALL'] regardless of initial shape", () => {
    const containers: V1Container[] = [
      { name: "no-sc", image: "nginx" }, // no securityContext
      { name: "no-cap", image: "nginx", securityContext: {} }, // has securityContext, no capabilities
      {
        name: "has-drop",
        image: "nginx",
        securityContext: { capabilities: { drop: ["NET_RAW"] } },
      }, // existing drop
    ];

    setAllContainersDropAllCapabilities(containers);

    for (const c of containers) {
      const d = c.securityContext?.capabilities?.drop;
      expect(d).toEqual(["ALL"]);
    }
  });

  it("preserves other capabilities fields (like add) when overwriting drop", () => {
    const containers: V1Container[] = [
      {
        name: "keep-add",
        image: "nginx",
        securityContext: { capabilities: { add: ["NET_BIND_SERVICE"], drop: ["NET_RAW"] } },
      },
    ];

    setAllContainersDropAllCapabilities(containers);

    expect(containers[0].securityContext?.capabilities?.add).toEqual(["NET_BIND_SERVICE"]);
    expect(containers[0].securityContext?.capabilities?.drop).toEqual(["ALL"]);
  });

  it("updates all containers in the list, not just the first", () => {
    const containers: V1Container[] = [
      { name: "c1", image: "nginx" },
      { name: "c2", image: "busybox", securityContext: { capabilities: { add: ["SYS_PTRACE"] } } },
    ];

    setAllContainersDropAllCapabilities(containers);

    expect(containers.map(c => c.securityContext?.capabilities?.drop)).toEqual([["ALL"], ["ALL"]]);
    expect(containers[1].securityContext?.capabilities?.add).toEqual(["SYS_PTRACE"]);
  });

  it("is idempotent (calling twice keeps the same outcome and preserves other fields)", () => {
    const containers: V1Container[] = [
      {
        name: "idempotent",
        image: "nginx",
        securityContext: { capabilities: { add: ["CHOWN"], drop: ["SYS_ADMIN"] } },
      },
    ];

    setAllContainersDropAllCapabilities(containers);
    setAllContainersDropAllCapabilities(containers); // call again

    expect(containers[0].securityContext?.capabilities?.add).toEqual(["CHOWN"]);
    expect(containers[0].securityContext?.capabilities?.drop).toEqual(["ALL"]);
  });

  it("handles empty container list without throwing", () => {
    const containers: V1Container[] = [];
    expect(() => setAllContainersDropAllCapabilities(containers)).not.toThrow();
    expect(containers).toEqual([]);
  });
});

describe("findContainersWithoutDropAllCapability", () => {
  const REQUIRED = "ALL";
  const names = (xs: Ctx[]) => xs.map(c => c.name);

  it("treats missing/undefined/empty drop as violations", () => {
    const containers: Ctx[] = [
      { name: "no-cap", ctx: {} }, // no capabilities
      { name: "undef-cap", ctx: { capabilities: undefined } }, // capabilities undefined
      { name: "no-drop", ctx: { capabilities: {} } }, // has capabilities, no drop
      { name: "empty-drop", ctx: { capabilities: { drop: [] } } }, // empty drop
    ];

    const res = findContainersWithoutDropAllCapability(containers, REQUIRED);
    expect(names(res)).toEqual(["no-cap", "undef-cap", "no-drop", "empty-drop"]);
  });

  it("does NOT return containers that drop the required capability (even with others present)", () => {
    const containers: Ctx[] = [
      { name: "all-only", ctx: { capabilities: { drop: ["ALL"] } } },
      { name: "all-and-others", ctx: { capabilities: { drop: ["NET_RAW", "ALL"] } } },
    ];

    const res = findContainersWithoutDropAllCapability(containers, REQUIRED);
    expect(res).toHaveLength(0);
  });

  it("returns containers that drop other capabilities but not the required one", () => {
    const containers: Ctx[] = [
      { name: "missing1", ctx: { capabilities: { drop: ["NET_RAW"] } } },
      { name: "missing2", ctx: { capabilities: { drop: ["SYS_ADMIN", "CHOWN"] } } },
    ];

    const res = findContainersWithoutDropAllCapability(containers, REQUIRED);
    expect(names(res)).toEqual(["missing1", "missing2"]);
  });

  it("mixed list: only those missing the required capability are returned", () => {
    const containers: Ctx[] = [
      { name: "ok1", ctx: { capabilities: { drop: ["ALL"] } } },
      { name: "bad1", ctx: { capabilities: { drop: ["NET_RAW"] } } },
      { name: "bad2", ctx: {} },
      { name: "ok2", ctx: { capabilities: { add: ["SYS_PTRACE"], drop: ["ALL"] } } },
    ];

    const res = findContainersWithoutDropAllCapability(containers, REQUIRED);
    expect(names(res)).toEqual(expect.arrayContaining(["bad1", "bad2"]));
    expect(res).toHaveLength(2);
  });

  it("is case-sensitive: 'all' does not satisfy 'ALL' (documents current behavior)", () => {
    const containers: Ctx[] = [
      { name: "bad", ctx: { capabilities: { drop: ["all"] } } },
      { name: "ok", ctx: { capabilities: { drop: ["ALL"] } } },
    ];

    const res = findContainersWithoutDropAllCapability(containers, REQUIRED);
    expect(names(res)).toEqual(["bad"]);
  });

  it("works with a different required capability string", () => {
    const containers: Ctx[] = [
      { name: "ok", ctx: { capabilities: { drop: ["SYS_ADMIN"] } } },
      { name: "bad", ctx: { capabilities: { drop: ["NET_RAW"] } } },
    ];

    const res = findContainersWithoutDropAllCapability(containers, "SYS_ADMIN");
    expect(names(res)).toEqual(["bad"]);
  });

  it("does not mutate inputs (pure filter)", () => {
    const originalDrop = ["NET_RAW"];
    const containers: Ctx[] = [{ name: "x", ctx: { capabilities: { drop: originalDrop } } }];

    const res = findContainersWithoutDropAllCapability(containers, REQUIRED);
    expect(names(res)).toEqual(["x"]); // still a violation
    expect(containers[0].ctx.capabilities!.drop).toBe(originalDrop); // same reference
  });
});

describe("validateContainerCapabilities", () => {
  it("ignores containers without a non-empty capabilities.add", () => {
    const containers: Ctx[] = [
      { name: "no-sc", ctx: {} },
      { name: "no-cap", ctx: { capabilities: {} } },
      { name: "empty", ctx: { capabilities: { add: [] } } },
    ];

    const res = validateContainerCapabilities(containers, ["NET_BIND_SERVICE"]);
    expect(res).toEqual([]);
  });

  it("returns empty when all added caps are allowed", () => {
    const containers: Ctx[] = [
      { name: "c1", ctx: { capabilities: { add: ["NET_BIND_SERVICE", "CHOWN"] } } },
      { name: "c2", ctx: { capabilities: { add: ["DAC_OVERRIDE"] } } },
    ];
    const allowed = ["NET_BIND_SERVICE", "CHOWN", "DAC_OVERRIDE"];

    const res = validateContainerCapabilities(containers, allowed);
    expect(res).toEqual([]);
  });

  it("returns only containers with at least one disallowed cap, mapping to name + add only", () => {
    const containers: Ctx[] = [
      { name: "ok", ctx: { capabilities: { add: ["NET_BIND_SERVICE"] } } },
      { name: "bad1", ctx: { capabilities: { add: ["SYS_ADMIN"] } } },
      { name: "bad2", ctx: { capabilities: { add: ["CHOWN", "SYS_TIME"] } } },
    ];

    const res = validateContainerCapabilities(containers, ["NET_BIND_SERVICE", "CHOWN"]);
    expect(res).toEqual([
      { name: "bad1", ctx: { capabilities: { add: ["SYS_ADMIN"] } } },
      { name: "bad2", ctx: { capabilities: { add: ["CHOWN", "SYS_TIME"] } } },
    ]);
  });

  it("drops unrelated securityContext fields and creates new objects", () => {
    const containers: Ctx[] = [
      {
        name: "bad",
        ctx: {
          allowPrivilegeEscalation: true,
          runAsUser: 1234,
          capabilities: { add: ["SYS_ADMIN"] },
        },
      },
    ];

    const res = validateContainerCapabilities(containers, ["NET_BIND_SERVICE"]);

    // shape-only mapping
    expect(res).toEqual([{ name: "bad", ctx: { capabilities: { add: ["SYS_ADMIN"] } } }]);

    // purity
    expect(res[0]).not.toBe(containers[0]);
    expect(res[0].ctx).not.toBe(containers[0].ctx);

    // no extra fields
    expect(Object.keys(res[0].ctx).sort()).toEqual(["capabilities"]);
  });

  it('defaults missing name to "unnamed"', () => {
    const containers: Ctx[] = [{ ctx: { capabilities: { add: ["SYS_ADMIN"] } } }];

    const res = validateContainerCapabilities(containers, ["NET_BIND_SERVICE"]);
    expect(res).toEqual([{ name: "unnamed", ctx: { capabilities: { add: ["SYS_ADMIN"] } } }]);
  });

  it("preserves the order of the add list in the output", () => {
    const addList = ["CHOWN", "DAC_OVERRIDE", "SETUID", "SETGID"];
    const containers: Ctx[] = [{ name: "bad", ctx: { capabilities: { add: [...addList] } } }];

    const res = validateContainerCapabilities(containers, ["CHOWN", "SETUID"]); // not all allowed
    expect(res[0].ctx.capabilities?.add).toEqual(addList);
  });

  it("when allowed list is empty, any non-empty add list is a violation", () => {
    const containers: Ctx[] = [
      { name: "bad1", ctx: { capabilities: { add: ["NET_RAW"] } } },
      { name: "bad2", ctx: { capabilities: { add: ["CHOWN", "SYS_TIME"] } } },
      { name: "skip-empty", ctx: { capabilities: { add: [] } } }, // ignored
    ];

    const res = validateContainerCapabilities(containers, []);
    expect(res.map(r => r.name!)).toEqual(expect.arrayContaining(["bad1", "bad2"]));
    expect(res).toHaveLength(2);
  });

  it("case-sensitive check (documents current behavior)", () => {
    const containers: Ctx[] = [
      { name: "bad", ctx: { capabilities: { add: ["net_bind_service"] } } },
    ];

    const res = validateContainerCapabilities(containers, ["NET_BIND_SERVICE"]);
    expect(res).toEqual([{ name: "bad", ctx: { capabilities: { add: ["net_bind_service"] } } }]);
  });

  it("mixed list: only partially-disallowed containers are returned; fully-allowed are omitted", () => {
    const containers: Ctx[] = [
      { name: "ok1", ctx: { capabilities: { add: ["CHOWN"] } } },
      { name: "bad1", ctx: { capabilities: { add: ["SYS_ADMIN"] } } },
      { name: "bad2", ctx: { capabilities: { add: ["CHOWN", "SYS_TIME"] } } },
      { name: "skip1", ctx: {} }, // ignored
      { name: "skip2", ctx: { capabilities: { add: [] } } }, // ignored
    ];

    const res = validateContainerCapabilities(containers, ["CHOWN"]);
    expect(res.map(r => r.name!)).toEqual(expect.arrayContaining(["bad1", "bad2"]));
    expect(res).toHaveLength(2);
  });
});
