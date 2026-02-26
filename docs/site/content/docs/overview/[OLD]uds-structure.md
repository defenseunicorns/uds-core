---
title: LEGACY --UDS Technical Structure
draft: true
---

## Foundational apps

UDS Core provides a foundational set of applications that form the backbone of a secure and efficient mission environment. Each application addresses critical aspects of microservices communication, monitoring, logging, security, compliance, and data protection. These applications are essential for establishing a reliable runtime environment and ensuring that mission-critical applications operate seamlessly.

By leveraging these applications within UDS Core, users can confidently deploy and operate source packages that meet stringent security and performance standards. UDS Core provides the applications and flexibility required to achieve diverse mission objectives, whether in cloud, on-premises, or edge environments. UDS source packages cater to the specific needs of Mission Heroes and their mission-critical operations. Below, we'll discuss some of those key applications.

## Powered by Open Source Tools

At a high level, UDS bundles infrastructure, platform, and mission applications in a way that makes them portable to
different mission systems and environments. It is an end-to-end solution that establishes and leverages a secure and declarative baseline
to streamline software delivery. UDS tightly integrates and leverages Defense Unicorns' open source projects: Zarf,
Pepr, and Lula. The UDS CLI serves as the interaction point connecting these components, facilitating
seamless deployment and security of infrastructure within the UDS platform.

### Zarf

Zarf is the generic bundler and installer for UDS. It plays a critical role in the UDS platform by simplifying the packaging and delivery of applications. Zarf delivers platform infrastructure and applications in a declarative state via a collection of Zarf Packages while reducing the need for mission personnel in constrained or classified environments to be Kubernetes or platform experts.

Zarf enables the deployment of Big Bang and other DevSecOps tools, platforms, or infrastructure across security boundaries and classification levels. Zarf also simplifies the installation, updating, and maintenance of DevSecOps capabilities such as Kubernetes clusters, logging, and Software Bill of Materials (SBOM) compliance out of the box. Most importantly, Zarf keeps applications and systems running even when disconnected. For more information, see the [Zarf documentation](https://docs.zarf.dev/docs/zarf-overview) or [Zarf GitHub page](https://github.com/defenseunicorns/zarf#readme).

### Pepr

Pepr automates the integration of applications with runtime capabilities within an environment. This is the core project that will enable the agnostic runtime of applications into any UDS environment as Pepr will adjust the application configuration to be compatible with the target environment. Pepr seamlessly integrates UDS Bundles and Zarf Components, forming a growing library of bundles and components. It streamlines the integration process, enabling application teams to leverage a wide range of pre-built bundles and packages without the need for extensive manual configuration. For additional information, please see the [Pepr GitHub page](https://github.com/defenseunicorns/pepr#readme).

### Lula

Lula is an open-source compliance-as-code tool that brings GitOps principles to compliance management in software projects. It enables teams to represent security and regulatory controls as structured code, integrate them into normal development workflows, and automatically assess changes through pull requests and CI/CD pipelines. By treating compliance artifacts — such as control definitions, mappings, and evidence — as versioned code, Lula helps teams track, review, and manage compliance frameworks (like NIST 800-53, CIS, SOC2, and custom standards) in a repository in a way that integrates seamlessly with everyday development practices. For additional information, please see the [Lula GitHub page](https://github.com/defenseunicorns/lula#readme).

## UDS CLI

The UDS CLI serves as the primary interface for users to interact with various components within the UDS platform. The UDS CLI streamlines the deployment process of mission applications and secure infrastructure. The UDS CLI simplifies the tasks involved in running mission applications while maintaining regulatory compliance in a unified and efficient manner.

UDS CLI simplifies deployment by bundling multiple Zarf Packages into a single deployable artifact. This process ensures that UDS Bundles, which encompass infrastructure, platform, and mission applications, can be efficiently deployed within any Mission Hero's system environment. Additionally, the UDS CLI extends its capabilities to Pepr, where multiple Pepr applications are bundled and deployed as a single Pepr Module to support UDS Bundles during runtime.

The UDS CLI is the interaction point for the entire UDS platform and combines and deploys various UDS products. This unified interface allows users to interact with UDS as a comprehensive platform, simplifying the management of mission-critical applications and components.

## UDS Core Capabilities

| **Capability**                     | **Application**                                                                                                                                                                                                                                                                                                                                       |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Service Mesh**                   | **[Istio](https://istio.io/):** A powerful service mesh that provides traffic management, load balancing, security, and observability features.                                                                                                                                                                                                                       |
| **Monitoring**                     | **[Metrics Server](https://kubernetes-sigs.github.io/metrics-server/):** Provides container resource utilization metrics API for Kubernetes clusters.<br><br>**[Prometheus](https://prometheus.io/):** Scrapes Metrics Server API and application metrics and stores the data in a time-series database for insights into application health and performance.<br><br> **[Grafana](https://grafana.com/grafana/):** Provides visualization and alerting capabilities based on Prometheus's time-series database of metrics. |
| **Logging**                        | **[Vector](https://vector.dev/):** A companion agent that efficiently gathers and sends container logs to Loki and other storage locations (S3, SIEM tools, etc), simplifying log monitoring, troubleshooting, and compliance auditing, enhancing the overall observability of the mission environment.<br><br> **[Loki](https://grafana.com/docs/loki/latest/):** A log aggregation system that allows users to store, search, and analyze logs across their applications. |
| **Security and Compliance**        | **[Falco](https://falco.org/):** Provides real-time threat detection and security monitoring for cloud-native environments.<br><br> **[Pepr](https://pepr.dev/):** UDS policy engine and operator for enhanced security and compliance.|
| **Identity and Access Management** | **[Keycloak](https://www.keycloak.org/):** A robust open-source Identity and Access Management solution, providing centralized authentication, authorization, and user management for enhanced security and control over access to mission-critical resources.|
| **Backup and Restore**             | **[Velero](https://velero.io/):** Provides backup and restore capabilities for Kubernetes clusters, ensuring data protection and disaster recovery.|
| **Authorization**                  | **[AuthService](https://github.com/istio-ecosystem/authservice):** Offers centralized authorization services, managing access control and permissions within the Istio mesh. AuthService plays a supporting role to Keycloak as it handles part of the OIDC redirect flow.|
