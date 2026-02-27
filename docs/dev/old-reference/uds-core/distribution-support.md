---
title: Distribution Support
sidebar:
  order: 3
---

UDS Core is a versatile platform designed to operate across any [CNCF conformant](https://www.cncf.io/training/certification/software-conformance/) Kubernetes distribution. This documentation provides an overview of UDS Core's testing with different distributions as well as expectations and support provided for other distributions.

### Tested Distributions

| Distribution | Status (latest pipeline) | Testing Schedule |
|-------------|--------------|---------------------------------------------------------------------------------------------------------|
| [K3s](https://k3s.io/) (run with [k3d](https://k3d.io/stable/)) | [![K3d HA Test](https://github.com/defenseunicorns/uds-core/actions/workflows/test-k3d-ha.yaml/badge.svg?branch=main&event=schedule)](https://github.com/defenseunicorns/uds-core/actions/workflows/test-k3d-ha.yaml?query=event%3Aschedule+branch%3Amain) | Nightly and before each release |
| [Amazon EKS](https://aws.amazon.com/eks/) | [![EKS Test](https://github.com/defenseunicorns/uds-core/actions/workflows/test-eks.yaml/badge.svg?branch=main&event=schedule)](https://github.com/defenseunicorns/uds-core/actions/workflows/test-eks.yaml?query=event%3Aschedule+branch%3Amain) | Weekly and before each release |
| [Azure AKS](https://azure.microsoft.com/en-us/products/kubernetes-service) | [![AKS Test](https://github.com/defenseunicorns/uds-core/actions/workflows/test-aks.yaml/badge.svg?branch=main&event=schedule)](https://github.com/defenseunicorns/uds-core/actions/workflows/test-aks.yaml?query=event%3Aschedule+branch%3Amain) | Weekly and before each release |
| [RKE2](https://github.com/rancher/rke2) (run on [AWS](https://aws.amazon.com/)) | [![RKE2 Test](https://github.com/defenseunicorns/uds-core/actions/workflows/test-rke2.yaml/badge.svg?branch=main&event=schedule)](https://github.com/defenseunicorns/uds-core/actions/workflows/test-rke2.yaml?query=event%3Aschedule+branch%3Amain) | Weekly and before each release |

:::note
Unless otherwise indicated, the Kubernetes version used for testing is typically one minor version back from the [latest release](https://kubernetes.io/releases/) ("n-1"). If the latest Kubernetes version were 1.33, testing would be performed on 1.32, on the latest patch version where possible.
:::

### Other Distributions

UDS Core is typically compatible with other CNCF-conformant Kubernetes distributions that have not reached their end of life. While these distributions are not part of our regular testing pipeline, we welcome and will review bug reports and contributions related to compatibility issues. When reporting issues, please include details about your environment and any relevant logs.
