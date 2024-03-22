# Unicorn Delivery Service - K3d Core Bundle (UDS Core)

This bundle is used for demonstration, development, and testing of UDS Core. In addition to the [UDS Core applications](../../README.md#core-applications), the included k3d uds-dev-stack provides:

- [K3d](https://k3d.io/) - Containerized K3s Kubernetes Enviroment
- [Minio](<https://min.io/>) - In-cluster S3 Object Storage (See below for more details)
- [Local Path Provisioner](<https://github.com/rancher/local-path-provisioner>) - Storage Provider with RWX configured
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
##### loki (loki)
| Variable | Description | Path |
|----------|-------------|------|
| `LOKI_CHUNKS_BUCKET` | The object storage bucket for Loki chunks | loki.storage.bucketNames.chunks |
| `LOKI_RULER_BUCKET` | The object storage bucket for Loki ruler | loki.storage.bucketNames.ruler |
| `LOKI_ADMIN_BUCKET` | The object storage bucket for Loki admin | loki.storage.bucketNames.admin |
| `LOKI_S3_ENDPOINT` | The S3 endpoint | loki.storage.s3.endpoint |
| `LOKI_S3_REGION` | The S3 region | loki.storage.s3.region |
| `LOKI_S3_ACCESS_KEY_ID` | The S3 Access Key ID | loki.storage.s3.accessKeyId |
| `LOKI_S3_SECRET_ACCESS_KEY` | The S3 Secret Access Key | loki.storage.s3.secretAccessKey |

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


## Override Examples:

### Minio Customization

You can customize the Minio deployed with uds-k3d at deploy time via your ```uds-config.yaml```.

```yaml
variables:
  uds-k3d-dev:
    BUCKETS:
      - name: "myfavoritebucket"
        policy: "public"
        purge: false
    USERS:
      - accessKey: console
        secretKey: "console-secret"
        policy: consoleAdmin
```

For more details on how to customize the Minio deployment, please see [Configuring Minio](https://github.com/defenseunicorns/uds-k3d/blob/main/docs/MINIO.md).

### Loki example using AWS S3
By default Loki will be configured to use the uds-k3d built in Minio, but variables are exposed with this bundle to configure external object storage

You can customize the Loki setup at deploy time via ```uds-config.yaml```

```yaml
variables:
  core:
    LOKI_CHUNKS_BUCKET: loki
    LOKI_RULES_BUCKET: loki
    LOKI_ADMIN_BUCKET: loki
    LOKI_S3_ENDPOINT: loki.s3.us-east-1.amazonaws.com
    LOKI_S3_REGION: us-east-1
    LOKI_S3_ACCESS_KEY_ID: <ACCESS_KEY_ID>
    LOKI_S3_SECRET_ACCESS_KEY: <SECRET_ACCESS_KEY>
```