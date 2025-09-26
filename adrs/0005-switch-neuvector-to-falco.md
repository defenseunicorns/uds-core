# 5. Switch Runtime Security from NeuVector to Falco

Date: 2025-09-26

## Status

Accepted

## Context

UDS Core currently ships with NeuVector as its runtime security solution in the Runtime Security functional layer. Through comprehensive evaluation and hands-on testing, we have identified several operational and strategic challenges with NeuVector that warrant a replacement:

**Operational Complexity**: NeuVector provides a broad suite of features, most of which remain unused in typical UDS deployments. This increases resource consumption, maintenance overhead, and operational complexity without delivering proportional value.

**Resource Overhead**: NeuVector's multi-component architecture (controllers, scanners, enforcers) consumes significant memory resources (~1 GiB across components), while alternative solutions operate at a fraction of that cost.

## Decision

We will replace NeuVector with **Falco** as the runtime security solution in UDS Core's Runtime Security functional layer.

Falco was selected based on operational considerations:

- **Operational Value**: Falco provides extensive prebuilt rules mapped to MITRE ATT&CK and built-in alerting via Falcosidekick delivering immediate operational value
- **Time to Value**: Falco requires minimal configuration to begin detecting malicious activity
- **Community Maturity**: As a CNCF Graduated project with 8,200+ GitHub stars and strong ecosystem support, Falco offers superior community backing and long-term sustainability

## Consequences

### Positive

- **Reduced Operational Overhead**: Lower memory footprint and simplified single-component deployment
- **Immediate Security Value**: Rich default ruleset provides detection capabilities out-of-the-box without the need for custom rule development
- **Strong Integration Ecosystem**: Built-in support for Slack, Mattermost, Alertmanager, Prometheus, and other observability tools
- **Proven Maturity**: CNCF Graduated project with extensive production deployments and active community

### Negative

- **No Prevention Capabilities**: Falco is detection-only and cannot block malicious syscalls or processes at runtime (unlike NeuVector's enforcement capabilities)
- **Limited UI**: Falco does not provide a comprehensive web interface for security event visualization (though this can be addressed via Grafana dashboards)

## Implementation Details

- Replace NeuVector Zarf package with Falco Zarf package (Falco will be offered as an initial optional component in the Runtime Security layer until Neuvector is fully deprecated)
- NeuVector will be moved to a standalone package for users who wish to continue using it
- Leverage and enable Falco's default ruleset
- Document integration patterns for alert routing to various destinations (Slack, Mattermost, etc.)
- Update UDS Core Runtime Security functional layer documentation

The implementation will maintain the existing functional layer structure, allowing users to opt-in to runtime security capabilities as needed.

## Alternatives Considered

1. **Tetragon**: Offers superior prevention capabilities via eBPF enforcement but requires significant engineering effort to build rulesets, alerting pipelines, and dashboards. The operational overhead was deemed too high for the current use case requirements.

2. **Maintaining NeuVector**: Rejected due to operational complexity and resource overhead.
