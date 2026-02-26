---
title: LEGACY --Acronyms & Key Terminology
draft: true
---

## Key Terms

Before diving further into UDS and its features, it is essential to understand some key terms that form the foundation of UDS:

### Mission Heroes
Mission Heroes are individuals focused on securely migrating their application workloads across various environments - ranging from shifting between multiple cloud providers to transitioning between cloud, on-premises, or edge environments. Mission Heroes leverage UDS Bundles to deliver unique mission objectives on their timelines and within their preferred environments.

### Zarf Package
A Zarf Package plays a critical role in the UDS platform by facilitating the packaging and delivery of applications and capabilities.

### UDS Package
A UDS Package is a collection of open-source applications bundled together to create a single UDS Package. UDS Packages are bundled and delivered in a consistent and repeatable manner to achieve successful mission outcomes. These packages leverage UDS to bundle, deploy, and operate securely in the Mission Heroes specific environment.

### UDS Application
A UDS Application represents a specific open-source tool selected to accomplish a function in the mission operations process. Each application is accomplished by selecting a specific tool to perform the function. For instance, source code management can be accomplished using a tool like GitLab, and runtime policy enforcement can be achieved with a tool like Kyverno.

### UDS Application Dependency
A UDS Application dependency refers to environment-specific needs and infrastructure that must be met for a bundle with core applications to operate successfully. UDS Applications are designed to provide distinct functions and services. However, some UDS Applications may rely on external resources, services, or configurations to function as intended within a particular environment.

### UDS Core
UDS Core is a collection of several individual applications combined into a single Zarf Package that establishes a secure baseline for secure cloud-native systems. It comes equipped with comprehensive compliance documentation and prioritizes seamless support for highly regulated and egress-limited environments.

### UDS Bundle
A UDS Bundle is the fundamental building block of UDS. Each bundle is comprised of one or more UDS Applications or Packages that are grouped to enable a key part of the mission. These bundles provide a structured approach to assembling capabilities and enable the effective deployment of mission-oriented functionalities.

### Declarative Baseline
A declarative baseline is an explicit specification of the desired configuration and deployment of software components. Users may use declarative baselines to create a Zarf Package or UDS Bundle in UDS to precisely define what is intended to be deployed. The term "baseline" is used to emphasize that this declaration serves as the foundation for the final configuration, ensuring that the end-state matches the stated intentions.

### Authority to Operate
Authority to Operate (ATO) is a formal declaration that a system or application meets specific security requirements and is approved to operate in a given environment. Achieving ATO demonstrates compliance with regulations and standards, providing assurance that the system has undergone rigorous security testing and validation.

### Software Bill of Materials
A Software Bill of Materials (SBOM) is a comprehensive list of components used in building a software product. It provides transparency into the software supply chain, detailing the dependencies and libraries that make up the software. SBOMs are essential for understanding and managing software vulnerabilities, facilitating effective risk management and compliance efforts.

### Flavor (as in UDS Package or Bundle flavor)

UDS Packages and so bundles include docker images from someone's registries. Per mission-hero preference we can typically pull from one of three sources:

1. Unicorn Images. These are the best available images, with the fastest response time to new CVEs, lowest CVE counts, and smallest images. This flavor is denoted in source code as `unicorn` and may use different registry sources based on what is best.
2. Platform One's Ironbank. This image source is often required on DoD contracts. The flavor is denoted in source code as `registry1`.
3. The vendor's image registry. We refer to the vendor-flavor as `upstream`.

This builds off of [Zarf's package-flavors](https://docs.zarf.dev/ref/examples/package-flavors/#_top).

## How UDS Works

The UDS workflow is a systematic approach that enables Mission Heroes achieve mission objectives by deploying mission applications effectively and securely. UDS simplifies the deployment process while ensuring the delivery of secure and mission-critical applications. From establishing secure runtimes with a UDS Bundle to enhancing deployment efficiency with UDS Packages and deploying tailored mission capabilities, UDS empowers Mission Heroes to achieve successful and secure deployments across various environments. UDS supports your team at every step, from building foundational environments to deploying mission-specific applications that drive impactful outcomes.

### Infrastructure as Code (IaC)

UDS Core applications rely on various dependencies, such as relational databases, key-value stores, and object stores. These requirements can be met through environment-provided services hosted within the infrastructure layer. UDS offers two approaches for fulfilling these dependencies: utilizing in-cluster resources or leveraging external infrastructure services.

The decision to provision external resources is based on mission environment specifics, granting your teams the flexibility to adapt while maintaining operational efficiency. UDS IaC ensures consistency and reduces manual efforts, providing an optimal foundation for various mission needs through the automation of provisioning, configuration, and management of infrastructure resources.

### Building the UDS Core Bundle

The UDS workflow begins with the creation and maintenance of a UDS Bundle. This bundle forms the foundation of a secure runtime environment for your mission applications. UDS Bundles provide the necessary baseline tools that ensure the security, compliance, and reliability of your mission-critical applications.

UDS Bundles are created to include essential components, configurations, and security measures. They lay the groundwork for deploying additional capabilities and software without compromising security. By building and employing UDS Bundles, Mission Heroes can establish a consistent and secure runtime environment that serves as a strong foundation for software deployments.

### Deploying Mission-Specific Packages

The final phase of the UDS workflow involves the deployment of mission-specific packages onto the secure UDS environments that have been established. These packages are tailored to meet the unique needs of your mission and enhance the execution of your application.

Mission-specific packages are bundled and delivered alongside your application. They provide specialized functionalities, services, and tools that align with your mission objectives. Whether it's generative AI-driven solutions, software factories, collaborative tools, or identity and access management, UDS enables you to deploy these packages whenever and in whatever environment best fits your mission needs.
