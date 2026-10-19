# 13. Send Registry Falco alerts to Slack

Date: 2026-09-29

## Status

Proposed

## Context

Falco detects suspicious activity in Registry, but its alerts currently appear only in logs. Engineers need to see those alerts where they can decide whether to investigate. The team does not yet know which rules will be noisy in Registry or how often alerts will occur.

## Decision

Send alerts from all currently enabled Falco rules to a public Registry alert channel in Slack. The team will monitor it during business hours. Start in staging. Once the team agrees the staging alerts are useful and manageable, send production alerts to the same channel. Each message must identify its environment.

Send every detection from the enabled rules, regardless of Falco priority. This does not turn on rules that UDS Core already disables. Use Falcosidekick's Slack output with its minimum priority set to `debug`. Keep the full events in Loki. [UDS Core already supports Slack output](../docs/how-to-guides/runtime-security/route-runtime-alerts.mdx).

Keep each Slack message short: show the Falco priority, rule name, environment, affected namespace and pod, and time. An engineer should be able to recognize the event without opening Loki. Keep command lines and other detailed event data in Loki for investigation, and check the rendered Slack message in staging before relying on it.

Falco priority is the first indication of urgency, not a response deadline. The team will use the rule and the circumstances to decide what needs attention. Investigate alerts that suggest an active threat as soon as they are seen. Handle lower-priority or expected activity as time allows. For example, an event during planned maintenance may be expected, while the same event outside that window may need investigation. Slack does not provide an after-hours response commitment. Use the existing incident process if an alert needs escalation.

After the first week, the team will check whether the channel is too noisy. If a rule repeatedly reports expected behavior, tune that behavior or disable the specific rule if it has little value. This is an initial noise check, not the end of tuning. The team can suggest further changes as it learns from the alerts.

## Consequences

The broad initial feed gives the team a view of Falco detections without guessing which priorities matter in Registry. It may also produce noise until the team tunes the rules. Slack is a business-hours review channel, so this decision does not add automatic paging through Rootly.
