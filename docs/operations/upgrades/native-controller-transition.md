---
title: Native controller transition
description: Prepare for the one-way transition from Core Pepr to native Kubernetes admission and the Go controller, and recover a failed installation.
sidebar:
  order: 2.003
---

<!--
Copyright 2026 Defense Unicorns
SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial
-->

Core replaces its Pepr module with Kubernetes CEL admission and a Go controller. The transition preserves application `Package`, `Exemption`, and `ClusterConfig` resources and their identities. It is one-way: after the writer handoff, recover forward with the new controller.

## Breaking requirements and configuration changes

Upgrade Kubernetes to **1.36 or newer** before installing this Core runtime. The installer checks the server version and native admission APIs before stopping the old writer. Helm also enforces the version floor. Kubernetes 1.35 is no longer supported.

Review these changes before deployment:

| Previous setting or identity              | Replacement                                                                                  |
| ----------------------------------------- | -------------------------------------------------------------------------------------------- |
| Core runtime in `pepr-system`             | Core runtime in `uds-system`                                                                 |
| `pepr-uds-core.module.*` overrides        | Supported chart settings under `uds-controller.uds-controller.*`                             |
| `uds:pepr_admission:up` recording rule    | `uds:admission:up`                                                                           |
| `uds:pepr_watcher:up` recording rule      | `uds:reconciliation:up`                                                                      |
| `PEPR_SERVICE_MONITORS`                   | Removed; controller monitoring resources render when `monitoring.coreos.com/v1` is available |
| Core's previous Keycloak caller principal | `cluster.local/ns/uds-system/sa/uds-controller`                                              |

Review the controller chart values when migrating overrides. Pepr-specific fields do not have a direct equivalent. Keep the new Core principal allowed by any custom Keycloak admin AuthorizationPolicy. Core retains its existing Keycloak integration.

The host helper uses the same Kubernetes configuration as Zarf, including `KUBECONFIG` and credential plugins. It does not copy administrator credentials. Deployment hosts support Linux and macOS on amd64 and arm64, require a writable working directory, and must permit execution in Zarf's temporary directory. Use Zarf's `--tmpdir` option if the default temporary mount uses `noexec`.

## Installation sequence

The package carries out these steps:

1. Check Kubernetes prerequisites and adopt Core API ownership into `uds-system`, preserving CRD UIDs and existing custom resources. The API chart manages AdmissionParameters alongside the other Core CRDs, including schema upgrades.
2. Install configuration, infrastructure exemptions, and networking prerequisites.
3. Scale the old Core watcher to zero and wait for its owned Pods to disappear before starting Go reconciliation.
4. Start the new controller and wait for its current Package generation, networking, and compiled exemption snapshot.
5. Activate the replacement callbacks and native policies. Verify the installed contract, serving trust, automatic-repair activation for the current installation, and server-side admission probes in a dedicated scratch namespace.
6. Remove the replaced Core Pepr resources and release records. Other Pepr modules, shared namespaces, and shared CRDs remain outside retirement scope.

Unknown kinds in historical Core release manifests are retained with a warning rather than blocking verified retirement. Save the installation log and inspect the listed objects separately. Known resources still require matching live ownership before removal.

## Recover a failed transition

Keep the failed phase and error from the deployment log. Rerun the **same package or bundle**, against the **same cluster**, with the **same values and CLI mode**, after correcting the reported prerequisite. Do not switch back to a Pepr-based package or manually restart the old watcher after handoff.

Use these commands to inspect writer and controller state:

```bash
uds zarf tools kubectl -n pepr-system get deployment pepr-uds-core-watcher --ignore-not-found
uds zarf tools kubectl -n uds-system get deployments,pods
uds zarf tools kubectl get packages.uds.dev -A
```

If the replacement Deployment exists, inspect its logs and Helm history:

```bash
uds zarf tools kubectl -n uds-system logs deployment/uds-controller --all-containers=true --tail=200
uds zarf tools helm history uds-controller -n uds-system
```

Choose the recovery action from the failed phase:

| Failed phase                        | Recovery action                                                                                                                                                                    |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Prerequisite or API ownership check | Correct the Kubernetes version, missing API, permissions, or conflicting Helm ownership. These checks precede writer handoff. Do not remove CRDs to bypass adoption checks.        |
| Bootstrap after watcher drain       | Correct controller image, scheduling, configuration, or networking errors and rerun the deployment. Package reconciliation can pause until the new controller starts successfully. |
| Snapshot or admission verification  | Restore controller readiness, current Package status, exemption compilation, and webhook trust. Rerun the deployment; retirement remains gated by verification.                    |
| Retirement                          | Resolve the reported ownership or API error, then rerun. Already removed resources are tolerated, and verification runs again before further retirement.                           |

Zarf may roll back a failed chart upgrade. That chart rollback does not reverse the external writer handoff or restore Pepr. Inspect the actual cluster state and use the forward-recovery sequence above. Do not delete application Packages or CRDs to force progress.

Handled verification failures remove the owned scratch namespace with a UID precondition, including bounded cleanup after cancellation. A forcibly killed installer can leave an empty scratch namespace. List candidates with the following command and inspect them before removing any abandoned namespace:

```bash
uds zarf tools kubectl get namespaces -l app.kubernetes.io/managed-by=uds-core-transition
```

## Verify recovery

A successful deployment must finish admission verification and retirement. Confirm that the old watcher is absent, the new Deployment is available, and application Packages reconcile:

```bash
uds zarf tools kubectl -n pepr-system get deployment pepr-uds-core-watcher --ignore-not-found
uds zarf tools kubectl -n uds-system rollout status deployment/uds-controller --timeout=150s
uds zarf tools kubectl get packages.uds.dev -A
```

The absence of the old watcher alone is not proof of a completed transition. The installer also checks the active admission contract and mutation/denial behavior before it reports success.

## Related documentation

- [Supported distributions](/concepts/platform/supported-distributions/) describes Kubernetes compatibility.
- [Configuration changes](/operations/upgrades/configuration-changes/) describes applying bundle overrides.
- [Policy engine](/reference/operator-and-crds/policy-engine/) describes admission behavior.
