# Run K0s locally

Use the same [setup task](../../tasks/setup.yaml) as the [K0s CI workflow](../../.github/workflows/test-k0s.yaml) to create a single-node development cluster on Linux or macOS. The task installs the development stack and initializes Zarf. It does not deploy Core.

## Prerequisites

Prepare the following before starting:

- Follow the [contributor setup](../../CONTRIBUTING.md#setting-up-your-local-repository), including the pinned UDS CLI from `mise.toml`.
- On Linux, start Docker Engine. Your user must have access to its daemon.
- On macOS, start Docker Desktop with Linux containers. Allocate the [local demo resources](../getting-started/local-demo/basic-requirements.mdx#requirements) to its Linux VM. Use a configuration that permits privileged containers.
- Make port `127.0.0.1:6443` available. The task creates a container named `k0s-uds`; remove a previous test container before rerunning it.
- Use an internet connection to download the pinned images and development stack.

CI validates Linux amd64. On macOS, the procedure uses Docker's Linux VM.

## Create the cluster

Run these commands from the repository root, in a shell with the repository's mise tools activated:

```bash
docker info
export KUBECONFIG="$(pwd)/build/k0s/kubeconfig"
uds run -f tasks/setup.yaml k0s-test-cluster --no-progress
```

The task uses the Renovate-managed `DEFAULT_K0S_VERSION` pin. It builds the node image with the development stack's glibc/OpenSSL compatibility libraries for FIPS CNI binaries and configures shared mount propagation for Istio and node-exporter. Keep `KUBECONFIG` set in subsequent terminals so commands target this cluster.

## Run the manual smoke test

Check the node, DNS, and development stack:

```bash
uds zarf tools kubectl wait --for=condition=Ready node/k0s-uds --timeout=300s
uds zarf tools kubectl rollout status deployment/coredns -n kube-system --timeout=300s
uds zarf tools kubectl rollout status daemonset/nginx -n kube-system --timeout=300s
uds zarf tools kubectl get pods -A
uds zarf tools kubectl get storageclass
```

Verify access through the Kubernetes API with a port-forward. This works without routing directly to Docker's private network, which is particularly useful on macOS. In one terminal, run:

```bash
uds zarf tools kubectl -n kube-system port-forward daemonset/nginx 18080:80
```

In another terminal, check the development proxy:

```bash
curl --fail --head http://127.0.0.1:18080/
```

Expect an HTTP `301` redirect to HTTPS. Stop the port-forward with Ctrl-C. The redirect confirms that the proxy is reachable; deploy Core before following it to an application.

## Deploy Core

Build the upstream flavor and apply the same values as CI:

```bash
uds run -f tasks/create.yaml standard-package --no-progress --with create_options="--skip-sbom" --set FLAVOR=upstream
uds zarf tools yq '.falco.falco.collectors.containerEngine.engines.cri.sockets = ["/run/k0s/containerd.sock"]' \
  test/values/k3d-standard/values.yaml > build/k0s/values.yaml
uds zarf package deploy build/zarf-package-core-*.tar.zst \
  --values build/k0s/values.yaml --components '*' --confirm --no-progress
```

Use a build directory containing only the Core package for the architecture and flavor you intend to deploy. The CI workflow runs the non-k3d validation and end-to-end tasks on Linux amd64. Those tasks write load-balancer addresses into `/etc/hosts` and assume direct access to the cluster network; they are not a macOS smoke-test command.

For local application access on either OS, use `uds zarf connect` or a Kubernetes port-forward. The setup publishes the API port only, not application ports.

## Collect failure logs

Collect node logs before deleting the container, even when the Kubernetes API is unavailable:

```bash
mkdir -p build/k0s/logs
docker container inspect k0s-uds --format '{{json .State}}' > build/k0s/logs/container-state.json
docker logs --timestamps k0s-uds > build/k0s/logs/k0s.log 2>&1
docker cp k0s-uds:/var/log/. build/k0s/logs/node
```

When the API responds, also capture pod status and events:

```bash
uds zarf tools kubectl get pods -A -o wide > build/k0s/logs/pods.txt
uds zarf tools kubectl get events -A --sort-by=.metadata.creationTimestamp > build/k0s/logs/events.txt
```

The [CI guide](ci-testing.md#k0s) describes the uploaded diagnostic artifacts.

## Troubleshooting

### Problem: Inotify exhaustion on Linux

**Symptom:** Node logs report `failed to create inotify fd: too many open files`, and DNS or networking pods do not become ready.

**Solution:** Inspect `cat /proc/sys/fs/inotify/max_user_instances` and stop unused local clusters. Multiple clusters can exhaust the host's shared inotify limit. Increasing the container's open-file limit does not change that host limit. If resources remain exhausted, ask the host administrator to raise it before retrying.

### Problem: Docker network addresses are unreachable on macOS

**Symptom:** The kubeconfig works, but a pod or load-balancer IP does not respond from macOS.

**Solution:** Use the port-forward procedure above. Docker's Linux VM owns the cluster network; the setup exposes the API through `127.0.0.1:6443`.

## Clean up

Remove the test container and its anonymous volumes after collecting any needed logs. This deletes the cluster's data:

```bash
docker rm -fv k0s-uds
unset KUBECONFIG
```

The generated kubeconfig and build artifacts remain under `build/k0s`. You can remove that directory after saving any logs you need.

## Related documentation

- [CI testing](ci-testing.md#k0s): triggers, flavors, and diagnostic artifacts.
- [Supported distributions](../concepts/platform/supported-distributions.mdx): CI compatibility coverage.
- [Contributor setup](../../CONTRIBUTING.md): development tools and repository setup.
