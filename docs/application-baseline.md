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
| **Service Mesh**                   | **[Istio](https://istio.io/):** A powerful service mesh that provides traffic management, load balancing, security, and observability features.                                                                                                                                                                                                                       |
| **Monitoring**                     | **[Metrics Server](https://kubernetes-sigs.github.io/metrics-server/):** Provides container resource utilization metrics API for Kubernetes clusters. Metrics server is an optional (non-default) component since most Kubernetes distros provide it by default.<br><br>**[Prometheus](https://prometheus.io/):** Scrapes Metrics Server API and application metrics and stores the data in a time-series database for insights into application health and performance.<br><br> **[Grafana](https://grafana.com/grafana/):** Provides visualization and alerting capabilities based on Prometheus's time-series database of metrics. |
| **Logging**                        | **[Vector](https://vector.dev/):** A companion agent that efficiently gathers and sends container logs to Loki and other storage locations (S3, SIEM tools, etc), simplifying log monitoring, troubleshooting, and compliance auditing, enhancing the overall observability of the mission environment.<br><br> **[Loki](https://grafana.com/docs/loki/latest/):** A log aggregation system that allows users to store, search, and analyze logs across their applications. |
| **Security and Compliance**        | **[NeuVector](https://open-docs.neuvector.com/):** Offers container-native security, protecting applications against threats and vulnerabilities.<br><br> **[Pepr](https://pepr.dev/):** UDS policy engine and operator for enhanced security and compliance.|
| **Identity and Access Management** | **[Keycloak](https://www.keycloak.org/):** A robust open-source Identity and Access Management solution, providing centralized authentication, authorization, and user management for enhanced security and control over access to mission-critical resources.|
| **Backup and Restore**             | **[Velero](https://velero.io/):** Provides backup and restore capabilities for Kubernetes clusters, ensuring data protection and disaster recovery.|
| **Authorization**                  | **[AuthService](https://github.com/istio-ecosystem/authservice):** Offers centralized authorization services, managing access control and permissions within the Istio mesh. AuthService plays a supporting role to Keycloak as it handles part of the OIDC redirect flow.|
| **Frontend Views & Insights**      | **[UDS Runtime](https://github.com/defenseunicorns/uds-runtime)**: UDS Runtime is an optional component in Core that provides the frontend for all things UDS, providing views and insights into your UDS cluster. |
