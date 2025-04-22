---
title: Configuring Loki S3 Storage
---

## Loki Configuration with S3 and Temporary Credentials (Session Token)

This guide walks you through configuring Grafana Loki to use AWS S3 as object storage with **temporary credentials** (access key, secret key, and session token). It is tailored for developers deploying Loki in **SimpleScalable** mode using the **upstream Loki Helm chart**, with customizations to ensure proper propagation of session tokens.

---

### Configuration Overview

#### 1. **Obtain AWS Credentials**

Temporary AWS credentials (Access Key ID, Secret Access Key, and Session Token) can typically be copied from your cloud provider's IAM session tool or CLI. For example, using the AWS CLI:

```bash
aws sts get-session-token --duration-seconds 3600
```

Copy the values of `AccessKeyId`, `SecretAccessKey`, and `SessionToken` from the output.

Alternatively, if you're assuming a role with `aws sts assume-role`, extract the same three values from the response.

#### 2. **Prepare Namespace**

If the `loki` namespace doesn't already exist, create it before continuing:

```bash
kubectl create namespace loki
```
Alternatively, you can prepend the following yaml portion to the secret yaml:
```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: loki
---
```

#### 3. **Secrets Management**

Create a Kubernetes Secret with your temporary AWS credentials **before installing Loki**:

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: loki-secrets
  namespace: loki
stringData:
  accessKeyId: <AWS_ACCESS_KEY_ID>
  secretAccessKey: <AWS_SECRET_ACCESS_KEY>
  sessionToken: <AWS_SESSION_TOKEN>
```

:::caution
**Important**: This secret **must be created before** you deploy or upgrade the Loki Helm chart so that the environment variables are available at container startup.
:::

Apply the secret:

```bash
kubectl apply -f ./loki-aws-creds.yaml
```

#### 4. **`values.yaml` Highlights**

Ensure you:

- Set `configStorageType: Secret`
- Use `structuredConfig` to inject the full Loki config
- Use `extraEnvFrom` and `-config.expand-env=true` for each component

```yaml
loki:
  configStorageType: Secret
  structuredConfig:
    common:
      storage:
        s3:
          access_key_id: ${accessKeyId}
          secret_access_key: ${secretAccessKey}
          session_token: ${sessionToken}
          region: us-east-1
          endpoint: https://s3.us-east-1.amazonaws.com
          s3forcepathstyle: true
          insecure: false
    ruler:
      storage:
        type: s3
        s3:
          access_key_id: ${accessKeyId}
          secret_access_key: ${secretAccessKey}
          session_token: ${sessionToken}
          region: us-east-1
          endpoint: https://s3.us-east-1.amazonaws.com
          s3forcepathstyle: true
          insecure: false

read:
  extraArgs: ["-config.expand-env=true"]
  extraEnvFrom:
    - secretRef:
        name: loki-secrets

write:
  extraArgs: ["-config.expand-env=true"]
  extraEnvFrom:
    - secretRef:
        name: loki-secrets

backend:
  extraArgs: ["-config.expand-env=true"]
  extraEnvFrom:
    - secretRef:
        name: loki-secrets
```

---

### Gotchas

#### 1. **`session_token` not rendering**

Upstream Helm chart templates (e.g., `helpers.tpl`) **do not render `session_token`** into the generated `config.yaml` even if you provide it in `.Values.loki.storage.s3`. Use `structuredConfig` to bypass this limitation.

#### 2. **Environment variables not interpolated**

Make sure you set `-config.expand-env=true` in `extraArgs`, and load secrets via `extraEnvFrom`. Without this, `${sessionToken}` will be a literal string.

#### 3. **Secret Timing**

The `loki-secrets` secret **must be applied before** the Loki pods start. If not, the environment variables will be unset and authentication to S3 will fail.

---

### Debugging Tips

#### 1. **Check Pod Environment Variables**

```bash
kubectl exec -it <loki-pod> -- env | grep AWS
```

Ensure `accessKeyId`, `secretAccessKey`, and `sessionToken` are present.

#### 2. **Inspect Generated Config**

```bash
kubectl exec -it <loki-pod> -- cat /etc/loki/config/config.yaml
```

Look for `${sessionToken}` in the `common.storage.s3` and `ruler.storage.s3` sections.

#### 3. **S3 Access Errors**

Common message:

```
InvalidAccessKeyId: The AWS Access Key Id you provided does not exist in our records.
```

This typically means:

- `${sessionToken}` was not included
- IAM session expired
- Env interpolation failed
