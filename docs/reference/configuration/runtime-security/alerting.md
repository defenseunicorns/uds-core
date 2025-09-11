---
title: Runtime Security Alerting
sidebar:
  order: 2
tableOfContents:
  maxHeadingLevel: 4
---

Runtime security alerting enables real-time notifications when potentially malicious activity is detected in your environment.

## Falco Alerting

### Default Rules and Events

UDS Core ships Falco with [stable default rules](https://github.com/falcosecurity/rules/blob/main/rules/falco_rules.yaml) that detect common security threats such as:

- Privilege escalation attempts
- Unauthorized file access
- Suspicious network activity
- Container breakout attempts

See more about default rules in the [Falco documentation](https://falco.org/docs/reference/rules/default-rules/).

:::caution[Sandbox/Incubating Rules]
UDS Core currently does not include the Falco sandbox/incubating ruleset by default. These rules are experimental and may generate false positives.
:::

### Querying Events with Loki

By default, Falco generates events for rule violations and ships them to Loki for centralized log aggregation and querying.

You can query Falco events in Grafana Explore using the Loki data source with the following query:

```txt
{priority=~".+"}
```

This query retrieves all Falco events with any priority level. You can filter further by specific priorities or rules such as:

```txt
{priority="Warning"}
{rule="Search Private Keys or Passwords"}
```

### Grafana Dashboards

The upstream Falco helm charts include some Grafana dashboards out of the box for visualizing security events:

1. **Falco Metrics Dashboard** - Shows Falco performance and rule statistics
2. **Falco Sidekick Metrics Dashboard** - Displays Sidekick forwarding performance
3. **Falco Sidekick Events Dashboard** - Visualizes security events and logs

These dashboards are automatically available in Grafana when Falco is deployed and can be accessed through the standard UDS Core Grafana interface.

### External Alert Forwarding

While Loki integration provides centralized logging of Falco events, it's recommended to configure external alert forwarding using [Falco Sidekick's native output forwarding](https://github.com/falcosecurity/falcosidekick#outputs) for real-time notifications.  It is generally a good idea to send these alerts to a messaging platform like Slack, Microsoft Teams where these security events can be more visbile to relevant teams.

:::tip[Network Egress]
By default, the Falco UDS Package locks down network egress for security reasons.  If you need to ship alerts to external services, ensure you override the `additionalNetworkAllow` value like so:
```yaml
packages:
  - name: core
    repository: oci://ghcr.io/defenseunicorns/packages/uds/core
    ref: x.x.x-upstream
    optionalComponents:
      - falco
    overrides:
      falco:
        uds-falco-config:
          values:
            - path: additionalNetworkAllow
              value:
                # ref: https://uds.defenseunicorns.com/reference/configuration/custom-resources/packages-v1alpha1-cr/#allow
                # Allow egress to your.remotehost.com on port 443 using TLS
                - direction: Egress
                  selector:
                    app.kubernetes.io/name: falcosidekick
                    ports:
                      - 443
                    remoteHost: your.remotehost.com # set to the hostname where you want to send events
                    remoteProtocol: TLS
                    description: "Allow egress Falco Sidekick to your.remotehost.com" # update description as needed
```
:::

#### Slack Integration

To configure Slack alerts for Falco events, add the following bundle overrides:

```yaml
packages:
  - name: core
    repository: oci://ghcr.io/defenseunicorns/packages/uds/core
    ref: x.x.x-upstream
    optionalComponents:
      - falco
    overrides:
      falco:
        falco:
          values:
            - path: falcosidekick.config.slack
              value:
                slack:
                  # -- Slack Webhook URL (ex: <https://hooks.slack.com/services/XXXX/YYYY/ZZZZ>), if not `empty`, Slack output is *enabled*
                  webhookurl: "<YOUR_WEBHOOK_SECRET>"
                  # -- Slack channel (optional)
                  channel: "#<YOUR_SLACK_CHANNEL>"
                  # -- Slack Footer (optional)
                  footer: ""
                  # -- Slack icon (optional)
                  icon: ""
                  # -- Slack username (optional)
                  username: ""
                  # -- `all` (default), `text` (only text is displayed in Slack), `fields` (only fields are displayed in Slack)
                  outputformat: "all"
                  # -- minimum priority of event to use this output, order is `emergency\|alert\|critical\|error\|warning\|notice\|informational\|debug or ""`
                  minimumpriority: "notice"
                  # -- a Go template to format Slack Text above Attachment, displayed in addition to the output from `slack.outputformat`. If empty, no Text is displayed before Attachment
                  messageformat: ""
```

This configuration will send Falco alerts with priority "notice" and above to your specified Slack channel.

#### Mattermost Integration

To configure Mattermost alerts for Falco events, add the following bundle overrides:

```yaml
packages:
  - name: core
    repository: oci://ghcr.io/defenseunicorns/packages/uds/core
    ref: x.x.x-upstream
    optionalComponents:
      - falco
    overrides:
      falco:
        falco:
          values:
            - path: falcosidekick.config.mattermost
              value:
                mattermost:
                  # -- Mattermost Webhook URL (ex: <https://your.mattermost.instance/hooks/YYYY>), if not `empty`, Mattermost output is *enabled*
                  webhookurl: "<YOUR_WEBHOOK_SECRET>"
                  # -- Mattermost Footer (optional)
                  footer: ""
                  # -- Mattermost icon (avatar) (optional)
                  icon: ""
                  # -- Mattermost username (optional)
                  username: ""
                  # -- `all` (default), `text` (only text is displayed in Mattermost), `fields` (only fields are displayed in Mattermost)
                  outputformat: "all"
                  # -- minimum priority of event to use this output, order is `emergency\|alert\|critical\|error\|warning\|notice\|informational\|debug or ""`
                  minimumpriority: "notice"
                  # -- a Go template to format Mattermost Text above Attachment, displayed in addition to the output from `mattermost.outputformat`. If empty, no Text is displayed before Attachment
                  messageformat: ""
```

This configuration will send Falco alerts with priority "notice" and above to your specified Mattermost instance.

#### Microsoft Teams Integration

To configure Microsoft Teams alerts for Falco events, add the following bundle overrides:

```yaml
packages:
  - name: core
    repository: oci://ghcr.io/defenseunicorns/packages/uds/core
    ref: x.x.x-upstream
    optionalComponents:
      - falco
    overrides:
      falco:
        falco:
          values:
            - path: falcosidekick.config.teams
              value:
                teams:
                  # -- Teams Webhook URL (ex: <https://outlook.office.com/webhook/XXXXXX/IncomingWebhook/YYYYYY>), if not `empty`, Teams output is *enabled*
                  webhookurl: "<YOUR_WEBHOOK_SECRET>"
                  # -- Teams section image (optional)
                  activityimage: ""
                  # -- `all` (default), `text` (only text is displayed in Teams), `facts` (only facts are displayed in Teams)
                  outputformat: "all"
                  # -- minimum priority of event to use this output, order is `emergency\|alert\|critical\|error\|warning\|notice\|informational\|debug or ""`
                  minimumpriority: "notice"
```

This configuration will send Falco alerts with priority "notice" and above to your specified Microsoft Teams channel.
