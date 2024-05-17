---
title: Application Baseline
type: docs
weight: 1
---

UDS Core provides a foundational set of applications that form the backbone of a secure and efficient mission environment. Each application addresses critical aspects of microservices communication, monitoring, logging, security, compliance, and data protection. These applications are essential for establishing a reliable runtime environment and ensuring that mission-critical applications operate seamlessly.

By leveraging these applications within UDS Core, users can confidently deploy and operate source packages that meet stringent security and performance standards. UDS Core provides the applications and flexibility required to achieve diverse mission objectives, whether in cloud, on-premises, or edge environments. UDS source packages cater to the specific needs of Mission Heroes and their mission-critical operations. Below are some of the key applications offered by UDS Core:

{{% alert-note %}}
For optimal deployment and operational efficiency, it is important to deliver a UDS Core Bundle before deploying any other optional bundle (UDS or Mission). Failure to meet this prerequisite can alter the complexity of the deployment process. To ensure a seamless experience and to leverage the full potential of UDS capabilities, prioritize the deployment of UDS Core as the foundational step.
{{% /alert-note %}}

## Core Baseline

| **Capability**                     | **Application**                                                                                                                                                                                                                                                                                                                                       |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Service Mesh**                   | **Istio:** A powerful service mesh tool that provides traffic management, load balancing, security, and observability features.                                                                                                                                                                                                                       |
| **Monitoring**                     | **Prometheus Stack:** Collects and stores time-series data for insights into application health and performance.<br><br> **Grafana:** Provides visualization and alerting capabilities for monitoring metrics.<br><br> **Metrics Server:** Offers resource utilization metrics for Kubernetes clusters, aiding in capacity planning and optimization. |
| **Logging**                        | **Loki:** A log aggregation system that allows users to store, search, and analyze logs across their applications.<br><br> **Promtail:** A companion agent that efficiently gathers and sends log data to Loki, simplifying log monitoring, troubleshooting, and compliance auditing, enhancing the overall observability of the mission environment. |
| **Security and Compliance**        | **NeuVector:** Offers container-native security, protecting applications against threats and vulnerabilities.<br><br> **Pepr:** UDS policy engine and operator for enhanced security and compliance.                                                                                                                                                  |
| **Identity and Access Management** | **Keycloak:** A robust open-source Identity and Access Management solution, providing centralized authentication, authorization, and user management for enhanced security and control over access to mission-critical resources.                                                                                                                     |
| **Backup and Restore**             | **Velero:** Provides backup and restore capabilities for Kubernetes clusters, ensuring data protection and disaster recovery.                                                                                                                                                                                                                         |
| **Authorization**                  | **AuthService:** Offers centralized authorization services, managing access control and permissions within the mission environment.                                                                                                                                                                                                                   |
