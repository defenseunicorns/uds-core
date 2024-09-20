# Unicorn Delivery Service - K3d Slim Dev (UDS Core)

This bundle is a trimmed-down version of [UDS Core](../k3d-standard/README.md) bundle, with only the following UDS Core applications installed:

- [Istio](https://istio.io/) - Service Mesh
- [KeyCloak](https://www.keycloak.org/) - Identity & Access Management
- [Pepr](https://pepr.dev) - UDS policy engine & operator

The k3d uds-dev-stack provides:

- [K3d](https://k3d.io/) - Containerized K3s Kubernetes Environment
- [Minio](https://min.io/) - In-cluster S3 Object Storage (See below for more details)
- [Local Path Provisioner](https://github.com/rancher/local-path-provisioner/) - Local Storage with RWX
- [MetalLB](https://metallb.universe.tf/) - Provides type: LoadBalancer for cluster resources and Istio Gateways
- [HAProxy](https://www.haproxy.org/) - Utilizes k3d host port mapping to bind ports 80 and 443, facilitating local FQDN-based routing through ACLs to MetalLB load balancer backends for Istio Gateways serving *.uds.dev, keycloak.uds.dev, and *.admin.uds.dev.

## Available Overrides
### Package: uds-k3d
##### uds-dev-stack (minio)
| Variable | Description | Path |
|----------|-------------|------|
| `BUCKETS` | Set Minio Buckets | buckets |
| `SVCACCTS` | Minio Service Accounts | svcaccts |
| `USERS` | Minio Users | users |
| `POLICIES` | Minio policies | policies |


### Package: core

##### istio-admin-gateway (uds-istio-config)
| Variable | Description | Path |
|----------|-------------|------|
| `ADMIN_TLS_CERT` | The TLS cert for the admin gateway (must be base64 encoded) | tls.cert |
| `ADMIN_TLS_KEY` | The TLS key for the admin gateway (must be base64 encoded) | tls.key |

##### istio-tenant-gateway (uds-istio-config)
| Variable | Description | Path |
|----------|-------------|------|
| `TENANT_TLS_CERT` | The TLS cert for the tenant gateway (must be base64 encoded) | tls.cert |
| `TENANT_TLS_KEY` | The TLS key for the tenant gateway (must be base64 encoded) | tls.key |

##### istio-tenant-gateway (gateway)
| Variable | Description | Path |
|----------|-------------|------|
| `TENANT_SERVICE_PORTS` | The ports that are exposed from the tenant gateway LoadBalancer (useful for non-HTTP(S) traffic) | service.ports |

##### keycloak (keycloak)
| Variable | Description | Path |
|----------|-------------|------|
| `INSECURE_ADMIN_PASSWORD_GENERATION` | Generate an insecure admin password for dev/test | `insecureAdminPasswordGeneration.enabled` |
| `KEYCLOAK_HA`              | Enable Keycloak HA                         | `autoscaling.enabled`           |
| `KEYCLOAK_PG_USERNAME`     | Keycloak Postgres username                 | `postgresql.username`           |
| `KEYCLOAK_PG_PASSWORD`     | Keycloak Postgres password                 | `postgresql.password`           |
| `KEYCLOAK_PG_DATABASE`     | Keycloak Postgres database                 | `postgresql.database`           |
| `KEYCLOAK_PG_HOST`         | Keycloak Postgres host                     | `postgresql.host`               |
| `KEYCLOAK_DEVMODE`         | Enables Keycloak dev mode                  | `devMode`                       |


## Override Examples:

### Minio Customization

You can customize the Minio setup at deploy time via your ```uds-config.yaml```.

Example:

```yaml
variables:
  uds-k3d-dev:
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
