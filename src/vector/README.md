# Vector

Vector is a lightweight tool for building observability pipelines, built and maintained primarily by Datadog. Within UDS Core it is primarily used for log collection and shipping to destinations (like Loki and S3).

## Switching from Promtail to Vector

Within UDS Core we have made the decision to switch from Promtail (historically the log collector/shipper of choice) to Vector. The below contains primary motivating factors and impacts of this choice.

### Motivations

Promtail has historically been the tool of choice for log collection/shipping when using Loki. It provides a very lightweight layer to scrape logs from pods and hosts, label them with additional metadata, and ship them to Loki.

One of the main issues that has arisen with Promtail is its limited output/export options. Promtail only supports sending logs to one or more Loki instances. A common requirement in production environments is to ship logs to a secondary destination for collection/analysis by security teams and SIEM tools. Promtail is currently listed as [feature complete](https://grafana.com/docs/loki/latest/send-data/promtail/) so there is no expectation that additional export functionality would be added.

### Goals and Options

In choosing an alternative to Promtail we have a few primary objectives:
- Chosen tool must be capable of gathering host and pod logs: This has been our primary usage of Promtail in the past - gathering pods logs and host logs (to include k8s audit logs, controlplane logs, etc).
- Provide a tool that has numerous export options to cover specific needs for environments: Current known requirements include Loki, S3, and SIEM tools like Elastic and Splunk. Ideally the tool of choice supports all of these and more, allowing for expansion as new environments require it.
- Choose a tool that does not require major changes in our logging stack, but is flexible for future adjustments to the stack: As we do have active users of our product we want to be careful in switching tools, so ideally we would like a tool that is a "drop-in" replacement. However, we don't want to rule out future changes to other pieces of the stack (i.e. Loki) so choosing a tool that doesn't lock us into Loki is important.
- Focus on the log collection/shipping problem: While there are a number of tools that offer far more than just logging pipelines (metrics, traces, etc), we don't currently see a need to focus on these tools. These features are seen as a nice to have, but not being evaluated as the focus here.

Three tools in the space of log collection were considered:
- [Vector](https://vector.dev/): Opensource and maintained by Datadog, Vector provides input integrations with Kubernetes logs, arbitrary files, and [other sources](https://vector.dev/docs/reference/configuration/sources/). It has the necessary export integrations with Loki, S3, Elastic, Splunk and a [number of other sinks](https://vector.dev/docs/reference/configuration/sinks/). Vector is a newer tool that has not yet reached a 1.0 release, but has risen in popularity due to its performance improvements over other tools.
- [FluentBit](https://fluentbit.io/): Fluentbit was historically used in Big Bang and supports file based inputs as well as [other inputs](https://docs.fluentbit.io/manual/pipeline/inputs). It also supports the necessary output integrations (Loki, S3, Elastic, Splunk and [others](https://docs.fluentbit.io/manual/pipeline/outputs)). FluentBit is a CNCF graduated project and is relatively mature. Fluentbit fell out of favor with Big Bang due to some of the complexities around managing it at scale, specifically with its buffering.
- [Grafana Alloy](https://grafana.com/docs/alloy/latest/): Alloy is a distribution of the OpenTelemetry Collector, opensource and maintained by Grafana Labs. It supports the necessary [inputs and outputs](https://grafana.com/docs/alloy/latest/reference/components/) (local file/k8s logs, Loki and S3). As a distribution of OTel it supports vendor-agnostic output formats and can be integrated with numerous other tools through the OTel ecosystem. While Alloy itself is relatively new, it is built on the previous codebase of Grafana Agent and the existing OTel framework. Notably it does not have any direct integrations with Splunk or Elastic, and its S3 integration is noted as experimental.

### Decision and Impact

Vector has been chosen as our replacement for Promtail. Primary motivations include:
- Vector has an extensive "component" catalog for inputs and outputs, with complete coverage of all currently desired export locations (and all are noted as "stable" integrations).
- Vector's configuration is simple and works well in helm/with UDS helm overrides (easy to add additional export locations via bundle overrides for example).
- Despite being a newer project, Vector's community is very active - with the most active contributors and GitHub stars compared to the other two tools.
- Vector is [significantly more performant](https://github.com/vectordotdev/vector?tab=readme-ov-file#performance) than other tooling in the space on most categories of metrics.

As with any decisions of tooling in core this can always be reevaluated in the future as different tools or factors affect how we look at our logging stack.

### Upgrade Considerations

During the upgrade there may be some duplication/overlap of log lines shipped to Loki due to the transition from Promtail's "position" file to Vector's "checkpoint" file (both used for tracking the last log line scraped/shipped). Grafana provides a built in feature to de-duplicate log entries when querying Loki, but this does not consistently work with all log lines due to the approach used by Grafana for de-duplication.

To ensure easy querying of logs across the upgrade, all logs shipped by Vector also have a `collector` label (with the value of `vector`). This can be used to filter down any logs to those collected by either Vector or Promtail (using the `=` and `!=` operators). In general you can use these filters along with tracking your upgrade timing to properly ignore duplicate logs for the short upgrade period.
