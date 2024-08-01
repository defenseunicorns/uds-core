# Grafana Alloy

Grafana Alloy is a distribution of the OpenTelemetry (OTel) Collector. Within UDS Core it is primarily used for log collection and shipping to destinations (like Loki and S3).

## Switching from Promtail to Alloy

Within UDS Core we have made the decision to switch from Promtail (historically the log collector/shipper of choice) to Grafana Alloy. The below contains primary motivating factors and impacts of this choice.

### Motivations

Promtail has historically been the tool of choice for log collection/shipping when using Loki. It provides a very lightweight layer to scrape logs from pods and hosts, label them with additional metadata, and ship them to Loki.

One of the main issues that has arisen with Promtail is its limited output/export options. Promtail only supports sending logs to one or more Loki instances. A common requirement in production environments is to ship logs to a secondary destination for collection/analysis by security teams and SIEM tools. Promtail is currently listed as [feature complete](https://grafana.com/docs/loki/latest/send-data/promtail/) so there is no expectation that additional export functionality would be added.

### Goals and Options

In choosing an alternative to Promtail we have a few primary objectives:
1. Chosen tool must be capable of gathering host and pod logs: This has been our primary usage of Promtail in the past - gathering pods logs and host logs (to include k8s audit logs, controlplane logs, etc).
1. Provide a tool that has a generic export option, as well as direct Loki integration: Generally we are looking for S3/S3-compatible object storage integrations as this is a common ask from end users. While specific SIEM tool integrations can be nice, it's more valuable to have something generic that most other tools can pick logs up from. In addition, a direct integration with Loki that makes it easy to label logs for indexing/querying in Loki is highly desirable.
1. Choose a tool that does not require major changes in our logging stack, but is flexible for future adjustments to the stack: As we do have active users of our product we want to be careful in switching tools, so ideally we would like a tool that is a "drop-in" replacement. However, we don't want to rule out future changes to other pieces of the stack (i.e. Loki) so choosing a tool that doesn't lock us into Loki is important.
1. Focus on the log collection/shipping problem: While there are a number of tools that offer far more than just logging pipelines (metrics, traces, etc), we don't currently see a need to focus on these tools. These features are seen as a nice to have, but not being evaluated as the focus here.

Three tools in the space of log collection were considered:
1. [Vector](https://vector.dev/): Opensource and maintained by Datadog, Vector provides input integrations with Kubernetes logs, arbitrary files, and [other sources](https://vector.dev/docs/reference/configuration/sources/). It has the necessary export integrations with Loki, S3, and a [number of other targets](https://vector.dev/docs/reference/configuration/sinks/). Vector is a newer tool that has not yet reached a 1.0 release, but has risen in popularity due to its performance improvements over other tools.
1. [FluentBit](https://fluentbit.io/): Fluentbit was historically used in Big Bang and supports file based inputs as well as [other targets](https://docs.fluentbit.io/manual/pipeline/inputs). It also supports the necessary export integrations (Loki, S3, OpenTelemetry and [others](https://docs.fluentbit.io/manual/pipeline/outputs)). FluentBit is a CNCF graduated project and is relatively mature.
1. [Grafana Alloy](https://grafana.com/docs/alloy/latest/): Alloy is a distribution of the OpenTelemetry Collector, opensource and maintained by Grafana Labs. It supports the necessary [inputs and outputs](https://grafana.com/docs/alloy/latest/reference/components/) (local file/k8s logs, Loki and S3). As a distribution of OTel it supports vendor-agnostic logging formats and can be integrated with numerous other tools through the OTel ecosystem. While Alloy itself is relatively new, it is built on the previous codebase of Grafana Agent and the existing OTel framework.

### Decision and Impact

Grafana Alloy has been chosen as our replacement for Promtail. Primary motivations include:
1. It is positioned as the "successor"/more feature-rich alternative to Promtail, to include [migration documentation](https://grafana.com/docs/alloy/latest/set-up/migrate/from-promtail/) focused on the switch. This makes it very easy to switch from Promtail to Alloy with little end user impact.
1. As Alloy is part of the Grafana ecosystem it has good integrations with Loki to provide the enriched log data we have come to expect from Promtail (simple approach to labelling logs, etc).
1. Through Alloy's S3 integration we can export logs to an additional storage location in generic formats (raw logs, OTel JSON) without any modification - no need to provide Alloy with edit/delete permissions.
1. By choosing a distribution of the OTel Collector we have flexibility in the future to switch to a different distribution of the OTel collector and/or easily swap out our logging backend (Loki) for something else that fits in the OTel Framework without needing to ensure specific tool compatibility. OTel is part of the CNCF (Incubating) and seems to be on a good trajectory.
1. Since Alloy is within the Grafana ecosystem there are good integrations and options for enterprise support from Grafana Labs across our entire logging stack. While this may not be common, it is worth calling out as a benefit.

As with any decisions of tooling in core this can always be reevaluated in the future as different tools or factors affect how we look at our logging stack.
