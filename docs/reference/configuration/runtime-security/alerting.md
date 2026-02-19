---
title: Runtime Security Alerting
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

#### Additional Rulesets

:::note
UDS Core ships with **sandbox** and **incubating** rulesets from the Falco community, but they are **disabled by default**. More information from Falco about these rulesets can be found [here](https://falco.org/docs/reference/rules/default-rules/).
:::

#### Enabling and Configuring Rulesets

To enable the [sandbox and incubating](https://falco.org/docs/reference/rules/default-rules/) rulesets and exclude specific rules, override the `sandBoxRulesEnabled`, `incubatingRulesEnabled`, `disabledRules` values in the `uds-falco-config` helm chart in your UDS Core bundle:

```yaml
overrides:
  falco:
    uds-falco-config:
      values:
        - path: "sandboxRulesEnabled"
          value: true
        - path: "incubatingRulesEnabled"
          value: true
        - path: "disabledRules"
          value: ["Write below root", "Read environment variable from /proc files"]
```

This configuration:

1. Enables the sandbox ruleset while excluding the "Write below root" rule.
2. Enables the incubating ruleset while excluding the "Read environment variable from /proc files" rule.

#### Disable Rules

You can explicitly disable any Falco rule by name using the `disabledRules` value. This is useful for reducing noise or suppressing rules that are not relevant to your environment. The rules you list here will be disabled across all enabled rulesets (stable, sandbox, and incubating).

To use this feature, provide an array of rule names under the `disabledRules` value in your configuration. The names must match the `rule` field in the Falco rules files.

#### How to find rule names

**Falco Official Documentation:**

  - [List of Falco Rules](https://falco.org/docs/reference/rules/default-rules/)

**UDS Core rule files:**

- Stable rules: [`src/falco/chart/rules/stable-rules.yaml`](https://github.com/defenseunicorns/uds-core/blob/main/src/falco/chart/rules/stable-rules.yaml)
- Sandbox rules: [`src/falco/chart/rules/sandbox-rules.yaml`](https://github.com/defenseunicorns/uds-core/blob/main/src/falco/chart/rules/sandbox-rules.yaml)
- Incubating rules: [`src/falco/chart/rules/incubating-rules.yaml`](https://github.com/defenseunicorns/uds-core/blob/main/src/falco/chart/rules/incubating-rules.yaml)
- Look for entries that start with `- rule:` to find the rule names.

**Falco logs:**

- When Falco detects an event, it logs the rule name in the output. You can find these logs by querying Loki with:

  ```txt
  {rule=~".+"}
  ```

### Rule Overrides and Custom Rules

In addition to enabling/disabling rulesets, you can customize Falco behavior with the following values:

- `overrides.lists`: modify list items used by Falco rules.
- `overrides.macros`: modify macro conditions used by rules.
- `overrides.rules`: add rule exceptions for specific rules.
- `extraRules`: define entirely new Falco rules.

#### Override Values Example

```yaml
overrides:
  falco:
    uds-falco-config:
      values:
        - path: overrides
          value:
            lists:
              trusted_images:
                action: replace
                items:
                  - "registry.corp/*"
                  - "gcr.io/distroless/*"
            macros:
              open_write:
                action: append
                condition: "or evt.type=openat"
            rules:
              "Unexpected UDP Traffic":
                exceptions:
                  action: append
                  items:
                    - name: allow_udp_in_smoke_ns
                      fields: ["proc.name", "fd.l4proto"]
                      comps: ["=", "="]
                      values:
                        - ["iptables-restor", "udp"]
        - path: extraRules
          value:
            - rule: "My Local Rule"
              desc: "Example additional rule"
              condition: evt.type=open
              output: "opened file"
              priority: NOTICE
              tags: ["local"]
```

#### Value Reference

- `overrides.lists.<listName>.action`: how to apply list items (for example `replace` or `append`).
- `overrides.lists.<listName>.items`: list entries to apply.
- `overrides.macros.<macroName>.action`: how to apply the macro condition.
- `overrides.macros.<macroName>.condition`: macro condition string.
- `overrides.rules.<ruleName>.exceptions.action`: how to apply exceptions.
- `overrides.rules.<ruleName>.exceptions.items`: exception entries (`name`, `fields`, `comps`, `values`).
- `extraRules`: array of Falco rule objects (`rule`, `desc`, `condition`, `output`, `priority`, `tags`, etc.).

**Exception Structure Rules**

- `fields`, `comps` must have the same length.
- When using multiple fields, each element in `values` must be an array (tuple) whose length matches the number of fields. When using a single field or omitting the `fields` specification, `values` can be a simple array of scalar values.

#### Common Overrides

In AWS EKS environments, it is common to see Falco alerts triggered by the CSI (Container Storage Interface) drivers, such as EFS and EBS, because these drivers launch privileged containers to perform storage operations. These alerts are expected and do not indicate malicious activity. To reduce noise and avoid unnecessary investigation of these known benign events, it is recommended to add rule exceptions for the affected CSI driver pods. The following override demonstrates how to safely suppress these alerts while maintaining visibility into other privileged container activity.

```
  values:
    - path: overrides
      value:
        rules:
          "Mount Launched in Privileged Container":
            exceptions:
              action: append
              items:
                - name: allow_csi_efs_node_mounts
                  fields: [k8s.ns.name, k8s.pod.name, proc.name]
                  comps: [=, startswith, =]
                  values:
                    - [kube-system, efs-csi-node-, mount]
                - name: allow_csi_ebs_node_mounts
                  fields: [k8s.ns.name, k8s.pod.name, proc.name]
                  comps: [=, startswith, =]
                  values:
                    - [kube-system, ebs-csi-node, mount]
```

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

The upstream Falco helm chart includes a Grafana dashboard out of the box for visualizing security events logs for Falcosidekick. The dashboard `Falco Logs` is automatically available in Grafana when Falco is deployed and can be accessed through the standard UDS Core Grafana interface.

### External Alert Forwarding

While Loki integration provides centralized logging of Falco events, it's recommended to configure external alert forwarding using [Falco Sidekick's native output forwarding](https://github.com/falcosecurity/falcosidekick#outputs) for real-time notifications. It is generally a good idea to send these alerts to a messaging platform like Slack, Microsoft Teams where these security events can be more visible to relevant teams.

:::tip[Network Egress]
By default, the Falco UDS Package locks down network egress for security reasons. If you need to ship alerts to external services, ensure you override the `additionalNetworkAllow` value like so:

```yaml
packages:
  - name: core
    repository: oci://ghcr.io/defenseunicorns/packages/uds/core
    ref: x.x.x-upstream
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
        uds-falco-config:
          values:
            - path: additionalNetworkAllow
              value:
                - direction: Egress
                  selector:
                    app.kubernetes.io/name: falcosidekick
                    ports:
                      - 443
                    remoteHost: api.slack.com
                    remoteProtocol: TLS
                    description: "Allow egress Falco Sidekick to Slack API"
```

This configuration will send Falco alerts with priority "notice" and above to your specified Slack channel.

#### Mattermost Integration

To configure Mattermost alerts for Falco events, add the following bundle overrides:

```yaml
packages:
  - name: core
    repository: oci://ghcr.io/defenseunicorns/packages/uds/core
    ref: x.x.x-upstream
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
        uds-falco-config:
          values:
            - path: additionalNetworkAllow
              value:
                - direction: Egress
                  selector:
                    app.kubernetes.io/name: falcosidekick
                    ports:
                      - 443
                    remoteHost: your.mattermost.instance # replace with your Mattermost hostname
                    remoteProtocol: TLS
                    description: "Allow egress Falco Sidekick to Mattermost instance"
```

This configuration will send Falco alerts with priority "notice" and above to your specified Mattermost instance.

#### Microsoft Teams Integration

To configure Microsoft Teams alerts for Falco events, add the following bundle overrides:

```yaml
packages:
  - name: core
    repository: oci://ghcr.io/defenseunicorns/packages/uds/core
    ref: x.x.x-upstream
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
        uds-falco-config:
          values:
            - path: additionalNetworkAllow
              value:
                - direction: Egress
                  selector:
                    app.kubernetes.io/name: falcosidekick
                    ports:
                      - 443
                    remoteHost: outlook.office.com
                    remoteProtocol: TLS
                    description: "Allow egress Falco Sidekick to Microsoft Teams"
```

This configuration will send Falco alerts with priority "notice" and above to your specified Microsoft Teams channel.
