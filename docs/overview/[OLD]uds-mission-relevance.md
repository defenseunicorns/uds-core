---
title: LEGACY --Mission & Technical Relevance
draft: true
---

Unicorn Delivery Service (UDS) is a hardware-agnostic software landscape built on top of the secure runtime platform provided by UDS Core. The UDS software landscape enables application development teams to focus their efforts on feature development and delivering
value while reducing the time spent grappling with the intricacies of individual runtime environments. Simultaneously,
it allows platform teams to allocate more resources to system operation and less to the concerns associated with
application nuances.

With UDS, mission teams can:

- Orchestrate applications into any supported environment with a secure runtime platform.
- Streamline application deployment, management, authorization, and scalability across developer and production environments.
- Facilitate obtaining an Authority to Operate (ATO) with documentation evidence to support that controls are met.
- Leverage open-source tools.

## UDS Mission Bundles and Packages

UDS consists of three main components, each serving a distinct purpose and working together to enable the deployment of mission capabilities and applications effectively.

**UDS Packages:** UDS Packages refer to the specific requirements of a Mission Hero. These packages must be bundled and delivered in a consistent and repeatable manner to effectively achieve mission outcomes. UDS Packages are integrated into UDS through a process that involves the coordination of various open-source projects.

**UDS Applications:** Reusable collections of external tools that enable and extend the functionality of UDS Bundles. They include object storage, databases, and other tools that assist Mission Heroes in delivering software and achieving mission objectives. Mission Applications are synonymous with external supporting applications, tested and proven reliable, packaged as Zarf Packages, and then readily prepared for deployment within the UDS environment.

**Mission Capabilities:** Represent the unique requirements and tools essential for our Mission Heroes to achieve their mission objectives. These capabilities include a wide range of functionalities, tools, and resources specifically tailored to meet the needs of our Mission Heroes.

**UDS Bundle:** A collection of UDS Packages that combine mission-critical tools into a secure runtime environment supported by UDS. UDS Bundles provide the foundational layer for deploying additional mission applications and must be deployed before any other UDS Package.

### Current UDS Mission Capabilities

| **Mission Capability**        | **Description**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Software Factory**          | Software Factory is designed to enhance software development in enterprise DevSecOps pipelines in cloud, on-premises, or edge systems. It offers a comprehensive package of preconfigured, open-source tools to host secure CI/CD pipelines in any environment. Software Factory automates the software delivery process, ensures security across the entire CI/CD pipeline, and provides Mission Heroes with immediate assurances of software safety. With Software Factory, Mission Heroes gain data independence, support and maintenance options, and secure CI/CD pipelines that adhere to industry and DoD best practices.                               |                                                                      |
| **Your App Your Environment** | Your App Your Environment streamlines application deployment for Mission Heroes, enabling seamless selection, deployment, and management of mission-critical software on a Kubernetes cluster. Leveraging UDS and open-source projects, it efficiently addresses challenges like egress-limited or air-gapped environment software delivery. Integrated with Defense Unicorns' DevSecOps Reference Guide compliant architecture, it ensures compliance and security, meeting 70% of technical security controls out of the box. Teams maintain ownership and independence over their applications, with the flexibility to deploy across various environments. |

## Powered by Open Source Tools

At a high level, UDS bundles infrastructure, platform, and mission applications in a way that makes them portable to
different mission systems and environments. It is an end-to-end solution that establishes and leverages a secure and declarative baseline
to streamline software delivery. UDS tightly integrates and leverages Defense Unicorns' open source projects: Zarf, Pepr, and Lula. The UDS CLI serves as the interaction point connecting these components, facilitating seamless deployment and security of infrastructure within the UDS platform.

## Environments Supported by UDS

UDS Bundles are designed to be deployed across various environments, providing flexibility and adaptability for your mission needs. UDS is adaptable to the requirements of different software applications and missions, ensuring successful deployment in diverse environments. Below are the environments where bundles can be deployed:

| **Environment**   | **Description**                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Cloud**         | UDS Bundles support both classified and unclassified cloud environments, including AWS, Azure, Google Cloud, and others. Deploy mission capabilities confidently to public, private, or hybrid cloud environments with UDS.                                                                                                                                                                                                                                               |
| **On-Premises**   | UDS Bundles are equipped to handle on-premises deployment for missions requiring it. Deploy capabilities securely within your infrastructure, providing a secure and controlled environment for software applications. Mission Heroes can bundle and deploy software to servers located within the organization's premises using UDS.                                                                                                                                     |
| **Tactical Edge** | UDS extends its capabilities to edge environments, enabling the deployment of software to devices with limited resources and connectivity. For scenarios where edge computing is crucial, UDS facilitates the deployment and operation of mission capabilities at the edge of the network, ensuring efficient and responsive operations. Tactical edge deployments are suitable for scenarios where low latency and real-time processing are critical to mission success. |
