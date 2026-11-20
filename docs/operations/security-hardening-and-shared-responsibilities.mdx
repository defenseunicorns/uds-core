---
title: UDS Core Security Hardening and Shared Responsibilities
description: An initial security and operations baseline for UDS Core environments, separating Core capabilities from deployer responsibilities for access, alerting, recovery, and maintenance.
sidebar:
  order: 0.001
---

UDS Core provides security controls and operational capabilities, but deploying its components does not establish that an environment is securely configured or actively monitored. Use this initial baseline to configure and operate Core, assign responsibilities, and review evidence that the controls work in your environment.

This guide applies to production and persistent nonproduction deployments, including environments inside the airgap. It provides baseline recommendations and identifies environment-specific choices; it does not establish a compliance certification or replace your organization's security requirements.

## Shared responsibilities

Core supplies software and integration, not a managed security operations service. The following boundaries apply even when one team performs several roles.

| Owner | Responsibility |
| --- | --- |
| UDS Core maintainers | Deliver versioned packages, security defaults, component integrations, release information, and configuration guidance. |
| Environment owner | Select and configure Core capabilities; secure the underlying infrastructure; operate access, notification destinations, storage, credentials, updates, and recovery. Assign people to monitor and respond. |
| Application owner | Configure application authorization and dependencies, identify data and recovery needs, and validate application behavior after changes or restoration. Coordinate these responsibilities with the environment owner. |

Capabilities described below apply when their [functional layers](/concepts/platform/functional-layers/) are installed. If you omit or replace a layer, record which system and team provide the corresponding capability, or document the gap and its risk. An absent component is not evidence that its responsibility has been satisfied.

## Record your environment's operating decisions

Assign an accountable owner for the environment and record the choices needed to apply this baseline:

- Installed Core version and functional layers, replacements, and any exceptions to the baseline.
- Administrative access paths, privileged identities, and credential owners.
- Alert destinations, responsible monitoring teams, coverage hours, escalation paths, and response expectations.
- Recovery objectives, protected data, backup destinations, retention, and restore procedures.
- Review and test intervals appropriate to the environment's mission and risk.

Choose notification and recovery systems that remain reachable under the environment's expected connectivity conditions. A service outside the cluster does not need to be on the public internet. Inside the airgap, use destinations and response procedures available within the security boundary.

## Initial baseline practices

Apply these practices before treating an environment as operational, and revisit them after changes. Follow the linked guides for configuration procedures rather than copying example values without evaluating their effect.

### Keep administrative interfaces private

**Core provides:** separate admin and tenant ingress gateways. This separation does not automatically provision a private load balancer or restrict the surrounding network.

**You configure and operate:** keep the admin gateway off the public internet. Restrict access to trusted administrative networks through a VPN, bastion, or equivalent controlled access path. Separate administrative access from tenant access at the network boundary; a different hostname or SSO login alone does not provide that separation. Select provider-specific load balancer settings, routing, and firewall rules.

**Evidence:** verify access from approved administrative locations and denial from untrusted locations. Review the actual network perimeter, not only the gateway Service's address or annotations.

See [Restrict the admin gateway to internal networks](/getting-started/production/build-your-bundle/#restrict-the-admin-gateway-to-internal-networks).

### Deliver runtime security alerts to an actively monitored destination

**Core provides:** Falco detects suspicious runtime behavior, and Falcosidekick forwards events. Core sends Falco events to Loki by default; searchable events do not establish an actively monitored response channel. Falco detects behavior rather than blocking it.

**You configure and operate:** select a Falcosidekick output and an appropriate minimum priority in the `falco` chart. Configure the destination and credentials, and allow the required destination traffic through `additionalNetworkAllow` in the `uds-falco-config` chart. Both output configuration and network access are necessary. If you send Falco events through Alertmanager, verify that path explicitly rather than assuming it is enabled.

Assign a team to actively monitor the destination, triage alerts, and escalate incidents during the recorded coverage periods. Document how the environment handles periods without coverage. Keep notification credentials current and review filtering so significant detections do not disappear from the response workflow.

**Evidence:** use an approved test detection appropriate to your configured rules and priority threshold. Confirm receipt at the destination and acknowledgment by the responsible team. Repeat the test after relevant routing, credential, or network changes. Running Falco pods and a configured webhook are not sufficient proof.

See [Route runtime alerts to external destinations](/how-to-guides/runtime-security/route-runtime-alerts/) and [Tune Falco runtime detections](/how-to-guides/runtime-security/tune-falco-detections/).

### Deliver platform alerts to an actively monitored destination

**Core provides:** Prometheus alerting rules and Alertmanager for notification routing. This does not establish your notification destinations or monitoring coverage.

**You configure and operate:** configure `alertmanager.config.receivers` and `alertmanager.config.route` in the `kube-prometheus-stack` chart. Configure credentials and the destination's network access through `additionalNetworkAllow` in the `uds-prometheus-config` chart. Choose receivers reachable in your environment and assign monitoring, triage, and escalation responsibilities just as you do for runtime alerts.

Review the full routing tree, severity matchers, silences, and intentionally discarded alerts. The notification guide's example uses an `empty` default receiver; unmatched alerts can therefore be discarded even when Alertmanager is healthy. Treat that example as a starting point, not a universal routing policy.

**Evidence:** confirm a representative alert reaches the intended receiver and someone responsible acknowledges it. An alert firing in Prometheus or visible in Grafana does not prove notification delivery or active monitoring. Record ownership and expiry for maintenance silences.

See [Route alerts to notification channels](/how-to-guides/monitoring-and-observability/route-alerts-to-notification-channels/).

### Protect recovery data and test restoration

**Core provides:** Velero integration for scheduled Kubernetes resource backups and supported volume backup mechanisms. A configured schedule does not prove that backups complete or cover application data. Volume snapshots require additional provider configuration and are disabled by default in Core's Velero values.

**You configure and operate:** choose recovery objectives, backup scope, frequency, retention, storage, credentials, and provider permissions. Use durable backup storage that survives the failures you plan to recover from. Protect backup access because Kubernetes resource backups include Secrets. Include external databases and object stores in your recovery plan; Velero does not back them up merely because an application uses them.

Identify how to recover identity data, including the Keycloak database, and application state. Coordinate with application owners on data consistency and supported backup methods. For rebuildable workloads, retain and test the configuration and artifacts needed to recreate them. Monitor backup failures and missing or stale backups through an owned response process.

**Evidence:** inspect successful backups and their actual resource and volume coverage. Restore representative data into an approved test environment and verify application behavior against your recovery objectives. Do not run destructive recovery exercises against operational data. A `Completed` backup alone is not proof that an application can recover.

See [Backup and restore](/how-to-guides/backup-and-restore/overview/), [Perform a manual backup](/how-to-guides/backup-and-restore/perform-backup/), and [Restore from a backup](/how-to-guides/backup-and-restore/perform-restore/).

### Control privileged access and credential lifecycles

**Core provides:** Keycloak and Authservice integration, authentication flow configuration, and platform access controls. Core does not create a default Keycloak administrator. Application-specific authorization remains an application responsibility.

**You configure and operate:** use individually attributable administrative accounts and least-privilege access. Review Kubernetes RBAC as well as platform and application roles. Follow the documented bootstrap and recovery lifecycle for Keycloak admins, rotate bootstrap credentials, and remove bootstrap Secrets. Avoid standing administrative accounts unless your operating model requires them, and document how retained access is controlled.

Select authentication methods appropriate to the environment, including multi-factor authentication. Validate federated identity-provider controls rather than assuming Keycloak supplies MFA for external SSO flows. Protect notification, storage, database, and deployment credentials; define their access, rotation, and revocation procedures.

**Evidence:** review effective permissions and actual login flows, not just declared configuration. Confirm who can administer the platform and retrieve sensitive credentials, and test the approved access-recovery procedure.

See [Manage Keycloak admin access](/how-to-guides/identity-and-authorization/manage-admin-access/) and [Configure authentication flows](/how-to-guides/identity-and-authorization/configure-authentication-flows/).

### Configure trusted certificates and durable identity storage

**Core provides:** gateway TLS configuration, trust-bundle distribution, and Keycloak database integration.

**You configure and operate:** supply certificates and trusted CA chains for the environment, protect private keys, and plan certificate renewal. Configure trust for external dependencies without disabling certificate validation. Replace Keycloak's embedded development database with a supported PostgreSQL deployment for operational use, and include that database in your maintenance and recovery plans. An external database can be an appropriately operated in-cluster service; it does not need to be a public cloud service.

**Evidence:** verify certificate validity and trust from the intended clients and services, and confirm identity data persists and can be recovered independently of a Keycloak pod.

See [Configure TLS certificates](/how-to-guides/networking/configure-tls-certificates/), [Manage trust bundles](/how-to-guides/networking/manage-trust-bundles/), and [Configure Keycloak database](/getting-started/production/build-your-bundle/#configure-keycloak-database).

### Preserve and review network and workload protections

**Core provides:** default-deny networking, mesh security controls, admission policies, and explicit policy exemptions.

**You configure and operate:** maintain a supported cluster with functioning network-policy enforcement. Review `Package` network declarations, egress permissions, policy exemptions, and overrides that weaken mesh or admission protections. Limit their scope, document their purpose and owner, and revisit whether they remain necessary. Core's ability to accept a configuration does not establish that the permissions are appropriate.

**Evidence:** inspect generated policies and exemptions, test required and prohibited access, and investigate differences from the intended configuration.

See [Audit your security posture](/how-to-guides/policy-and-compliance/audit-security-posture/) and [Production prerequisites](/getting-started/production/prerequisites/).

### Maintain the deployed platform and its infrastructure

**Core provides:** versioned releases, security updates, release notes, and upgrade guidance. Core releases do not patch the running environment automatically.

**You configure and operate:** track supported Core versions and security notices, apply updates through the documented upgrade path, and validate the environment afterward. Maintain Kubernetes, nodes, DNS, time synchronization, load balancers, storage, and external services with the responsible infrastructure teams. Keep environment configuration reproducible and review changes to it. Choose availability and capacity appropriate to the mission rather than assuming every deployment needs the same topology.

**Evidence:** record deployed versions and configuration, review update status, and verify platform health, application behavior, alert delivery, and recovery readiness after relevant changes.

See [Versioning and releases](/concepts/platform/versioning-and-releases/), [Upgrades](/operations/upgrades/overview/), and [High availability](/how-to-guides/high-availability/overview/).

## Review evidence without overstating assurance

Configuration inspection supports this baseline, but it cannot replace operational testing or accountable ownership. Distinguish these forms of evidence when reviewing an environment.

| Practice | Evidence inspection can establish | Evidence requiring a broader operational review |
| --- | --- | --- |
| Private administration | Gateway configuration and available cluster-side access policies | Actual perimeter reachability, VPN or firewall configuration, and approved administrative access |
| Alerting | Receivers, routes, egress policies, component health, and available delivery errors | End-to-end receipt, active monitoring, acknowledgment, escalation, and coverage |
| Recovery | Schedules, storage locations, backup status, and recorded resource or volume coverage | Application-consistent recovery, external-service coverage, and achieved recovery objectives |
| Identity and trust | Available RBAC, authentication configuration, certificate metadata, and bootstrap Secret presence | Effective external identity-provider controls, current realm behavior, justified access, and credential handling |
| Maintenance and policy | Deployed versions, declared configuration, and policy exemptions | Timely remediation, justified exceptions, and functioning controls outside the cluster |

Missing evidence, inaccessible systems, or untested behavior leave a question unresolved; they do not establish that a practice is satisfied. Do not include secret values in review reports.

## Open baseline decisions

The practices above form the initial baseline. The following decisions need further evaluation rather than a universal setting inferred from an example deployment:

- **Logging and Loki:** existing production guidance describes Loki object storage, and the [retention guide](/how-to-guides/logging/configure-log-retention/) documents configurable retention. Which storage, retention, forwarding, and log-review expectations belong in every environment's baseline remains open. This guide does not prescribe a universal Loki configuration or retention period.
- **Common timing and severity thresholds:** notification coverage, escalation times, Falco priority filters, backup frequency, retention, and restore-test intervals depend on mission and data requirements. Record environment-specific decisions now; common minimums need separate agreement.
- **Additional control coverage:** evaluate whether to extend the baseline with more specific host, Kubernetes API auditing, storage encryption, and credential-management practices. The infrastructure responsibility remains with the environment owner; this initial guide does not claim comprehensive coverage of those controls.

## Related documentation

- [Security concepts](/concepts/platform/security/) - Core's defense-in-depth capabilities and default protections.
- [Production deployment](/getting-started/production/overview/) - infrastructure provisioning and initial deployment guidance.
- [Functional layers](/concepts/platform/functional-layers/) - capabilities and trade-offs when selecting less than the full Core package.
- [GitLab hardening recommendations](https://docs.gitlab.com/security/hardening/) - an example of environment-aware hardening guidance.
- [AWS shared responsibility model](https://aws.amazon.com/compliance/shared-responsibility-model/) - an example of explicit provider and customer responsibility boundaries.
