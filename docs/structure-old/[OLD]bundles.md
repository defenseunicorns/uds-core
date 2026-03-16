---
title: UDS Bundles
draft: true
---

A UDS Bundle is a collection of [UDS Packages](/structure/packages) designed to facilitate the delivery of software solutions for specific
missions or software delivery processes. With UDS Bundles, teams can efficiently adapt to the unique
requirements of each mission without sacrificing the reliability and security of the software delivery process.

UDS Bundles enable:

- A structured and repeatable approach for delivering software solutions tailored to diverse mission needs. Each bundle serves as a collection of capabilities, facilitating the delivery of software solutions for specific mission objectives.
- Efficient adaptability to the unique requirements of each mission without compromising the reliability and security of the software delivery process.
- Secure and consistent software delivery by bundling tools and configurations required for specific mission capabilities, ensuring a standardized and reusable approach.

## Benefits of UDS Bundles

**Consistency:** UDS Bundles provide a standardized approach to software delivery, ensuring consistency across different
missions and environments.

**Reusability:** The modular nature of UDS Bundles allows for the reuse of capabilities, saving time and effort in
software delivery.

**Security and Compliance:** By incorporating controls and documented configurations, UDS Bundles promote secure and
compliant software deployments.

**Scalability:** UDS Bundles can be adapted and extended to accommodate different mission requirements and environments.

## Key Features

### Modularity and Reusability

UDS Bundles are designed to be modular and reusable, allowing teams to combine different bundles as
needed to meet the specific requirements of their missions or projects. By leveraging pre-defined capabilities and
tools, UDS Bundles provide a standardized and consistent approach to software delivery.

### Composition of UDS Bundles

Each UDS Bundle is composed of a set of capabilities, where each capability is achieved by selecting specific tools or
functional components to perform the required functions. This composition ensures that essential functionalities and
configurations are encapsulated within the bundle, making it easier to deploy and operate the software solutions.

### UDS Core Bundle

The UDS Core Bundle holds a significant role within the UDS architecture. It serves as the foundational bundle that must
be delivered before deploying any other optional bundles or mission capabilities. The UDS Core Bundle establishes
the basic architecture and secure runtime environment needed for successful software delivery using UDS.

### Versatility of UDS Bundles

UDS Bundles are versatile and can be shared and deployed across different environments, enabling consistent and
reliable results in various scenarios. This adaptability makes UDS Bundles suitable for diverse mission needs and environments.

### Security and Compliance

UDS Bundles include SBOMs for all included packages, including anything that [Zarf](https://docs.zarf.dev/ref/sboms/) has pulled and packaged. When using and integrating your bundle with UDS Core, you also benefit from compliance and security standards that are automatically handled for you during deployment, such as network policies and pod security policies. For additional details on the security protection provided by UDS see the [Security Overview section](/security/overview/).
