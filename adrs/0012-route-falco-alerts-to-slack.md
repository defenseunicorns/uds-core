# 12. Route Falco alerts to an owned Slack channel

Date: 2026-09-29

## Status

Proposed

## Context

[INFRA-150](https://linear.app/defense-unicorns/issue/INFRA-150/enable-falco-alerting-sent-to-rootly-or-slack) asks where Registry operators should receive Falco detections and whether some detections should page responders. Joel recommended starting with an ADR, favored a Slack channel over Rootly as the first destination, and asked how operators would monitor, tune, and respond to the alerts.

UDS Core already enables Falcosidekick and sends Falco events to Loki. It also supports the [Slack webhook and network egress overrides](../docs/how-to-guides/runtime-security/route-runtime-alerts.mdx) needed to send selected events to Slack. [Ark uses this route](https://github.com/defenseunicorns/infra-ark/blob/dev/tofu/core-packages.tf) with a `warning` minimum priority.

## Decision

For the first Registry rollout, send Falco events with priority `warning` or higher from Falcosidekick directly to a dedicated, Registry-owned Slack channel. Continue sending all Falco events to Loki. Do not add automatic Rootly paging in this iteration. Review actual alert volume and response needs before deciding whether any rule should page.

The Registry deployment will set `falcosidekick.config.slack.webhookurl` as a sensitive value, `falcosidekick.config.slack.minimumpriority` to `warning`, and `falcosidekick.config.slack.outputformat` to `text` as Ark does. It will allow Falcosidekick egress to `hooks.slack.com` on TLS port `443` through `additionalNetworkAllow`. The [Slack webhook determines the destination channel](https://docs.slack.dev/messaging/sending-messages-using-incoming-webhooks/). UDS Core does not need a new alerting component or default outbound Slack connection for this deployment-specific configuration.

Before enabling the route, the Registry team will name the channel owner, backup, and review cadence, and restrict channel access to responders. Falco rule output can include process command lines. The initial operating procedure is:

1. At rollout, after webhook or network-policy changes, and weekly thereafter, trigger a known `warning` detection from an approved test workload. The [`Search Private Keys or Passwords` integration test](../test/vitest/falco-integration.spec.ts) demonstrates one suitable rule. Confirm the same event appears in Slack and Loki, and inspect the Slack payload during rollout. If it reaches Loki but not Slack, check Falcosidekick logs, egress, and the webhook.
2. During the first week, review the channel daily. Use Loki to inspect the rule, workload, and surrounding events. Record repeated expected detections and adjust targeted rule exceptions or the notification threshold after review; retain the original events in Loki.
3. For a credible detection, investigate it and use the existing incident escalation process when human response is urgent. A Slack message alone does not provide a paging or response-time guarantee.

The [runtime alert routing guide](../docs/how-to-guides/runtime-security/route-runtime-alerts.mdx), [Falco tuning guide](../docs/how-to-guides/runtime-security/tune-falco-detections.mdx), and [Loki query guide](../docs/how-to-guides/runtime-security/query-falco-events.mdx) cover the existing configuration and investigation paths.

## Consequences

The initial route has these operational limits:

- The `warning` threshold may need tuning after the team sees actual alert volume.
- Weekly delivery checks leave a known test event in Slack and Loki.
- Channel review does not guarantee immediate response outside the team's stated review cadence. A follow-up decision must name the rules, destination, and on-call behavior before adding paging.

## Alternatives considered

These alternatives add noise or paging complexity before Registry has alert-volume data:

- **Send all events to Slack.** Lower-priority events remain available in Loki; forwarding them immediately would increase channel noise.
- **Send events directly to Rootly or page by priority.** Priority alone does not establish that a detection warrants waking an on-call responder. Defer paging until operators have reviewed real detections and selected specific rules.
- **Build a custom Slack integration.** Falcosidekick's native output already supports the proposed route, as Ark demonstrates.
