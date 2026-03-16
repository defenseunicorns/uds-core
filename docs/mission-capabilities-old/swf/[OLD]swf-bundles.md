---
title: LEGACY --Software Factory Bundles
draft: true
---

> [!NOTE]
> The following UDS Bundles are designed specifically for development and testing environments and are *not intended for production use*.

## [swf-dev](https://github.com/defenseunicorns/uds-software-factory/tree/main/bundles/dev)

**Bundle Overview**

This bundle is primarily for development purposes and requires an existing K3d cluster to deploy.

**System Requirements**

This bundle requires `9 CPUs and 28GB of memory` available to run effectively.

**Bundle Applications**

| Application       | Description                                                                                                                                                                               |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Minio             | In-cluster S3 Object Storage solution.                                                                                                                                                    |
| Postgres Operator | In-cluster PostgreSQL Database management tool.                                                                                                                                           |
| GitLab            | A comprehensive DevOps software package facilitating software development, security, and operational tasks.                                                                               |
| GitLab Runner     | A Continuous Integration (CI) runner tightly integrated with GitLab, streamlining automation of build, test, and deployment workflows.                                                    |
| Mattermost        | An open-source, self-hostable online chat service empowering real-time communication for teams and organizations.                                                                         |
| SonarQube         | An open-source platform developed by SonarSource, dedicated to the continuous inspection of code quality, ensuring adherence to high standards across the software development lifecycle. |

## [k3d-swf-demo](https://github.com/defenseunicorns/uds-software-factory/tree/main/bundles/k3d-demo)

**Bundle Overview**

Demo bundle of Software Factory deployed on top of [UDS Core](https://github.com/defenseunicorns/uds-core) that includes the deployment of an underlying K3d cluster.

**System Requirements**

- This bundle requires a minimum of `11 CPUs and 32GB of memory` available to run effectively.
- This bundle is best deployed on an adequately sized Linux machine with Docker or equivalent installed.

**Bundle Applications**

| Application       | Description                                                                                                                                                                               |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| UDS-K3d           | Containerized K3s with opinionated deployment for UDS development.                                                                                                                        |
| Minio             | In-cluster S3 Object Storage solution.                                                                                                                                                    |
| Postgres Operator | In-cluster PostgreSQL Database management tool.                                                                                                                                           |
| UDS Core          | Comprehensive suite including Service Mesh, IdAM, Monitoring, Logging, Metrics, UDS Policy Engine and Operator, Container Security, Backup and Restore functionalities.                   |
| GitLab            | A comprehensive DevOps software package facilitating software development, security, and operational tasks.                                                                               |
| GitLab Runner     | A Continuous Integration (CI) runner tightly integrated with GitLab, streamlining automation of build, test, and deployment workflows.                                                    |
| Mattermost        | An open-source, self-hostable online chat service empowering real-time communication for teams and organizations.                                                                         |
| SonarQube         | An open-source platform developed by SonarSource, dedicated to the continuous inspection of code quality, ensuring adherence to high standards across the software development lifecycle. |
