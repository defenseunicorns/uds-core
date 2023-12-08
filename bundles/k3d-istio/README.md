# Unicorn Delivery Service - K3d Istio (UDS Core)

> [!WARNING]  
> UDS Core is in early alpha and is not ready for general use.

UDS Core groups foundational Unicorn Delivery Service applications that are heavily influenced [Big Bang](https://repo1.dso.mil/big-bang/bigbang).

The core applications are:

- [Istio](https://istio.io/) - Service Mesh

The k3d uds-dev-stack provides:

- [K3d](https://k3d.io/) - Containerized K3s Kubernetes Enviroment
- [Minio](https://min.io/) - In-cluster S3 Object Storage (See below for more details)
- [Local Path Provisioner](https://github.com/rancher/local-path-provisioner/) - Local Storage with RWX
- [MetalLB](https://metallb.universe.tf/) - Provides type: LoadBalancer for cluster resources and Istio Gateways
- [HAProxy](https://www.haproxy.org/) - Utilizes k3d host port mapping to bind ports 80 and 443, facilitating local FQDN-based routing through ACLs to MetalLB load balancer backends for Istio Gateways serving *.uds.dev, keycloak.uds.dev, and *.admin.uds.dev.


## Prerequisites

<!-- table -->

| Dependency                                                     | Minimum Version |
| -------------------------------------------------------------- | --------------- |
| [Zarf](https://github.com/defenseunicorns/zarf/releases)       | 0.31.1          |
| [UDS CLI](https://github.com/defenseunicorns/uds-cli/releases) | 0.4.1           |
| [NodeJS](https://nodejs.org/en/download/)                      | LTS or Current  |

<!-- endtable -->

## Configuration

### Minio

You can customize the Minio setup at deploy time via your ```uds-config.yaml```.

Example:

```yaml
bundle:
  deploy:
    zarf-packages:
      uds-k3d-dev:
        set:
          buckets:
            - name: "myfavoritebucket"
              policy: "public"
              purge: false
          users:
            - accessKey: console
              secretKey: "console-secret"
              policy: consoleAdmin
```

For more details on how to customize the Minio deployment, please see [Configuring Minio](https://github.com/defenseunicorns/uds-k3d/blob/main/docs/MINIO.md).
