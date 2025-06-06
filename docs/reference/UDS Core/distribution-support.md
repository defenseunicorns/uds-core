---
title: Distribution Support
sidebar:
  order: 3
---

UDS Core is a versatile software baseline designed to operate effectively across a variety of Kubernetes distributions. While it is not specifically tailored to any single Kubernetes distribution, it is compatible with multiple environments. This documentation provides an overview of UDS Core's compatibility with different distributions and the level of support provided.

### Understanding Support Levels

- **Supported:** The Kubernetes distributions listed under this category undergo testing and are officially supported by UDS Core. Users can expect a high level of reliability and compatibility when deploying UDS Core on these distributions.

- **Compatible:** Kubernetes distributions listed under this category may not have undergone extensive testing in UDS Core's CI environments. While UDS Core may be compatible on these distributions, users should exercise caution and be prepared for potential compatibility issues or limitations.

| Distribution    | Category               | Support Level                                                                                             |
| --------------- | ---------------------- | --------------------------------------------------------------------------------------------------------- |
| K3d/K3s, Amazon EKS, Azure AKS, RKE2 on AWS | Tested                 | Supported Kubernetes distributions undergoing testing in CI environments.                                 |
| RKE2            | Tested                 | Supported Kubernetes distribution tested in production environments other than CI.                        |
| Other           | Untested/Unknown state | Compatible Kubernetes distributions that are not explicitly tested, documented, or supported by UDS Core. |
