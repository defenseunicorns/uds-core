# 12. Send Falco detections to Slack in Registry

Date: 2026-09-29

## Status

Proposed

## Context

Falco detections reach Loki, but nobody is notified when one fires. Falcosidekick already supports Slack webhooks, and [Ark uses this route](https://github.com/defenseunicorns/infra-ark/blob/dev/tofu/core-packages.tf).

A local test triggered a `Warning` when a pod searched an empty directory for a private key name:

```json
{
  "priority": "Warning",
  "rule": "Search Private Keys or Passwords",
  "output_fields": {
    "k8s.ns.name": "kube-system",
    "k8s.pod.name": "falco-adr-example",
    "proc.cmdline": "find /tmp/falco-adr-example -name id_rsa"
  }
}
```

Opening a shell in the same pod triggered a `Notice`. Both events reached Loki. The search was harmless, while a shell in an unexpected workload could need investigation. Falco priority alone cannot decide what should page someone.

## Decision

Core will send `NOTICE` and higher Falco detections to a restricted Slack channel in Registry. Falcosidekick will post each event as it occurs; all detections will continue to Loki. The Registry deployment will set `falcosidekick.config.slack.webhookurl` as a sensitive value, `falcosidekick.config.slack.minimumpriority` to `notice`, and `falcosidekick.config.slack.outputformat` to `all` so the message includes event fields. It will allow Falcosidekick egress to `hooks.slack.com:443` through `additionalNetworkAllow`. [UDS Core already supports these overrides](../docs/how-to-guides/runtime-security/route-runtime-alerts.mdx).

Core owns the channel and initial review. Before enabling it, Core will assign a primary and backup reviewer. They will review the channel once a day for the first 14 days. If a detection suggests active compromise, they will use the existing incident process and bring in the affected workload's owner. Slack does not provide paging or a response-time guarantee.

At rollout, trigger the harmless `Search Private Keys or Passwords` test above in an approved pod. Confirm the detection reaches Loki and Slack, and that the Slack message shows the rule, namespace, pod, and command. Repeat the check after webhook or egress changes.

After 14 days, Core will use Loki to count detections by rule and workload, then review the routing. Repeated expected events call for a targeted rule exception. If volume makes daily review impractical, tune noisy rules before raising the Slack threshold and losing `NOTICE` coverage. If no real detections appear, repeat the delivery check and leave alert volume unresolved.

Do not page automatically in this rollout. Container escape, fileless execution, dropped binaries, and reverse-shell rules are the first paging candidates. Promote a rule only after it has produced actionable events at an acceptable false-positive rate and has a named responder. Rootly remains an option for that later decision.

## Consequences

The first rollout has these limits:

- `NOTICE` coverage includes potentially useful shell and network behavior but may increase channel noise.
- Slack has no acknowledgement or response-time guarantee. The daily review is the initial operating commitment.
- Falco output can include process command lines, so channel access must stay limited to responders.

## Alternatives considered

We considered these routes:

- **Start at `warning`, as Ark does.** That would miss `Run shell untrusted` and `Redirect STDOUT/STDIN to Network Connection in Container`, both `NOTICE` rules worth reviewing.
- **Page through Rootly now.** Registry has no alert-volume baseline or validated paging rules.

## Related documentation

- [INFRA-150](https://linear.app/defense-unicorns/issue/INFRA-150/enable-falco-alerting-sent-to-rootly-or-slack) - Issue and discussion.
- [Route Falco alerts](../docs/how-to-guides/runtime-security/route-runtime-alerts.mdx) - Configure the Slack output and network egress.
- [Tune Falco detections](../docs/how-to-guides/runtime-security/tune-falco-detections.mdx) - Adjust rules after reviewing events.
- [Query Falco events](../docs/how-to-guides/runtime-security/query-falco-events.mdx) - Inspect detections in Loki.
