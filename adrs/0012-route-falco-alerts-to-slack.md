# 12. Route Falco detections to Slack for review

Date: 2026-09-29

## Status

Proposed

## Context

[INFRA-150](https://linear.app/defense-unicorns/issue/INFRA-150/enable-falco-alerting-sent-to-rootly-or-slack) asks how Registry operators should see, assess, and respond to Falco detections. UDS Core already sends the events to Loki, but Registry has no agreed notification route or review process. Falcosidekick supports a Slack webhook through existing UDS Core overrides, and [Ark uses that output](https://github.com/defenseunicorns/infra-ark/blob/dev/tofu/core-packages.tf).

Falco priority is a starting filter, not a measure of whether a detection needs a response. Registry does not yet have representative detections to establish alert volume or choose rules for paging. A local UDS Core test produced this shortened Falcosidekick event when a disposable pod searched an empty directory:

```json
{
  "priority": "Warning",
  "rule": "Search Private Keys or Passwords",
  "source": "syscall",
  "output_fields": {
    "k8s.ns.name": "kube-system",
    "k8s.pod.name": "falco-adr-example",
    "proc.cmdline": "find /tmp/falco-adr-example -name id_rsa"
  }
}
```

The same test produced a `Notice` event when an operator opened a shell in the pod. Both events reached Loki. The `Warning` search was benign, while a shell in another workload could merit review. This example shows event content, not normal alert volume or Slack message formatting.

## Decision

The UDS Core team owns the Falco alerting capability and its operating guidance. For the first Registry rollout, the Registry deployment will send detections at `warning` priority or higher from Falcosidekick to a restricted Slack channel. It will continue sending all detections to Loki. Slack is a review channel, not a paging destination; this iteration will not send Falco detections to Rootly.

The deployment will use the existing [Slack webhook and network egress overrides](../docs/how-to-guides/runtime-security/route-runtime-alerts.mdx). The `warning` minimum follows Ark's configuration as an initial filter, not a validated threshold. UDS Core does not need another alerting component or a default outbound Slack connection.

Before enabling the route, the UDS Core team will name a reviewer, review cadence, and escalation path. The reviewer will check Slack and query Loki for the `NOTICE` rules in the first two rows below. At rollout, operators will reproduce the harmless `Search Private Keys or Passwords` example above in an approved test pod and confirm it reaches Falcosidekick, Loki, and Slack. They will use real detections to tune rules and routing. The affected workload determines the responding team; a namespace such as `uds-system` does not establish ownership by itself.

## Rule assessment

The current [stable rules](../src/falco/chart/rules/stable-rules.yaml) suggest the following response levels. These are candidates for tuning after rollout, not rule-specific routes or automatic pages in the first iteration. Operators must check the affected workload and whether the activity was expected before escalating.

| Response level to evaluate | Rules |
| --- | --- |
| Investigate promptly if seen; consider paging after validation | `Detect release_agent File Container Escapes`, `Drop and execute new binary in container`, `Fileless execution via memfd_create`, `Netcat Remote Code Execution in Container`, `Redirect STDOUT/STDIN to Network Connection in Container`, `Linux Kernel Module Injection Detected`, `Debugfs Launched in Privileged Container`, `Clear Log Activities` |
| Review if seen; no automatic page | `Directory traversal monitored file read`, `Read sensitive file trusted after startup`, `Read sensitive file untrusted`, `Run shell untrusted`, `Remove Bulk Data from Disk`, `Create Symlink Over Sensitive Files`, `Create Hardlink Over Sensitive Files`, `Packet socket created in container`, `PTRACE attached to process`, `Execution from /dev/shm`, `Disallowed SSH Connection Non Standard Port` |
| Usually low signal; consider Loki-only after the trial | `System user interactive`, `Terminal shell in container`, `Search Private Keys or Passwords`, `PTRACE anti-debug attempt`, `Find AWS Credentials` |
| Disabled by default | `Contact K8S API Server From Container`, disabled in [Falco defaults](../src/falco/chart/values.yaml) because of noise |

The initial `warning` filter does not match these response levels. It sends the two search rules to Slack but misses `Run shell untrusted` and `Redirect STDOUT/STDIN to Network Connection in Container`, which Falco marks `NOTICE`. Review real detections before promoting a rule or adding paging. A page-worthy route needs a named responder and evidence that expected activity will not wake them routinely.

## Consequences

The initial route has these limits:

- A priority filter can send benign `Warning` events to Slack and leave potentially useful `Notice` events in Loki. Operators must review actual detections before changing the filter or adding rule-specific routes.
- Slack does not acknowledge alerts or guarantee response time. Operators use the existing incident process when a detection needs urgent response.
- Falco output can include process command lines. Channel access must remain limited to responders.
- A controlled test verifies delivery, but cannot establish normal alert volume or whether a rule should page.

## Alternatives considered

These options remain available if real detections show a need for them:

- **Send all detections to Slack.** This could make the channel too noisy to review.
- **Page through Rootly or Alertmanager.** Priority alone does not identify which detections justify paging. Select rules and responders after reviewing real events.
- **Route automatically by namespace.** Namespace helps identify the source workload but does not always identify its owner.
- **Build a custom Slack integration.** Falcosidekick already supports the initial route.

## Related documentation

- [Route Falco alerts](../docs/how-to-guides/runtime-security/route-runtime-alerts.mdx) - Configure Falcosidekick destinations and network egress.
- [Tune Falco detections](../docs/how-to-guides/runtime-security/tune-falco-detections.mdx) - Adjust rules after reviewing events.
- [Query Falco events](../docs/how-to-guides/runtime-security/query-falco-events.mdx) - Inspect detections in Loki.
