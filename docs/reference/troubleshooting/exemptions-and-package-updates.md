---
title: Exemption and Package Updates

sidebar:
  order: 1
---


## Exemptions and Package Updates in the Cluster

This guide provides steps to debug issues with `Exemptions` and `Packages` not being applied or updated in your Kubernetes cluster. Common symptoms include:
- Changes to Exemptions or Packages are not reflected in the cluster.
- Expected behavior in workloads remains unaffected.
- Logs indicate potential Kubernetes Watch failures.

Follow this guide to identify and resolve these issues.

## Initial Checklist

Before diving into detailed debugging, ensure the following:

- **Verify Configuration**:
   - Ensure that Exemptions and Packages are defined correctly in your manifests.
   - Refer to the specification documents for correct schema and examples:
     - [Packages Specification](/reference/configuration/custom-resources/packages-v1alpha1-cr)
     - [Exemptions Specification](/reference/configuration/custom-resources/exemptions-v1alpha1-cr)

- **Namespace for Exemptions**:
   - Ensure Exemptions are applied in the `uds-policy-exemptions` namespace, unless you are using an [override](/reference/configuration/uds-configure-policy-exemptions).

- **Cluster and Deployment Status**:
   - Confirm the cluster and relevant controller deployments are running without errors: 
      ```bash
      kubectl get pods -n pepr-system
      ```

## Troubleshooting Kubernetes Watch

Kubernetes Watch is a mechanism used to monitor resource changes in real-time. Failures in Watch can cause Exemptions and Package updates to not propagate.

### Steps to Check Watch Logs

1. **Identify the Controller Pod**:
   - Check the logs of the controller managing Exemptions using the following command:
     ```bash
     kubectl logs -n pepr-system deploy/pepr-uds-core | grep "Processing exemption"
     ```

   - If the logs **do not show entries similar to the following**, it may indicate that the Watch missed the event:
     ```json
     {"...":"...", "msg":"Processing exemption nvidia-gpu-operator, watch phase: MODIFIED"}
     ```

2. **Verify Package Processing**:
   - Use the following command to check logs for Package processing:
     ```bash
     kubectl logs -n pepr-system deploy/pepr-uds-core-watcher -f | egrep "Processing Package"
     ```

   - If the logs **do not show entries similar to the following**, it may indicate an issue with the Watch:
     ```json
     {"...":"...","msg":"Processing Package authservice-test-app/mouse, status.phase: Pending, observedGeneration: undefined, retryAttempt: undefined"}
     {"...":"...","msg":"Processing Package authservice-test-app/mouse, status.phase: Ready, observedGeneration: 1, retryAttempt: 0"}
     ```

### Reporting Watch Issues

If you are experiencing issues with the watch functionality, please provide the necessary logs and metrics to help us investigate. Follow these steps:

- **Open an Issue**  
   Visit the [Pepr GitHub Issues](https://github.com/defenseunicorns/pepr/issues/new?template=watch_failure.md) page and create a new issue using the **Watch Failure** template and attach the logs and metrics.
- **Collect Metrics from the Watcher**  
   Use the following command based on the image you are using to retrieve metrics from the watcher service, store them in `metrics.txt`:

   **Non-Airgap Environment** (all-images):
   ```bash
   kubectl run curler --image=nginx:alpine --rm -it --restart=Never -n pepr-system --labels=zarf.dev/agent=ignore -- curl -k https://pepr-uds-core-watcher/metrics
   ```

   **Upstream Image** `ghcr.io/defenseunicorns/pepr/controller`:
   ```bash
   kubectl exec -it -n pepr-system deploy/pepr-uds-core-watcher -- /nodejs/bin/node -e "process.env.NODE_TLS_REJECT_UNAUTHORIZED = \"0\"; fetch(\"https://pepr-uds-core-watcher/metrics\").then(res => res.text()).then(body => console.log(body)).catch(err => console.error(JSON.stringify(err)))"
   ```

   **Unicorn Image** `ghcr.io/defenseunicorns/pepr/private/controller`:
   ```bash
   kubectl exec -it -n pepr-system deploy/pepr-uds-core-watcher -- node -e "process.env.NODE_TLS_REJECT_UNAUTHORIZED = \"0\"; fetch(\"https://pepr-uds-core-watcher/metrics\").then(res => res.text()).then(body => console.log(body)).catch(err => console.error(err))"
   ```

   **Registry1 Image** `registry1.dso.mil/ironbank/opensource/defenseunicorns/pepr/controller`:
   ```bash
   kubectl exec -it -n pepr-system deploy/pepr-uds-core-watcher -- node -e "process.env.NODE_TLS_REJECT_UNAUTHORIZED = \"0\"; fetch(\"https://pepr-uds-core-watcher/metrics\").then(res => res.text()).then(body => console.log(body)).catch(err => console.error(err))"
   ```

- **Provide Watch Logs**  
   Include the logs from the controller and watch pod in the issue, store them in `watcher.log`.
   ```bash
   kubectl logs -n pepr-system deploy/pepr-uds-core-watcher
   ```
- **Provide Controller Logs**  
   Include the logs from the controller pods in the issue, store them in `admission.log`.
   ```bash
   kubectl logs -n pepr-system deploy/pepr-uds-core
   ```


## Related Links

- [Packages Specification](/reference/configuration/custom-resources/packages-v1alpha1-cr)
- [Exemptions Specification](/reference/configuration/custom-resources/exemptions-v1alpha1-cr)
- [Kubernetes Watch](https://kubernetes.io/docs/reference/using-api/api-concepts/#efficient-detection-of-changes)
