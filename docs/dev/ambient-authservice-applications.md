## Problem Statement

The UDS Operator already automates **Authservice** integration for Istio **sidecar mode** clusters:

- Custom AuthorizationPolicy: intercepts unauthenticated requests and routes them to Authservice.
- DENY AuthorizationPolicy: blocks traffic lacking a valid JWT before it hits the workload.
- RequestAuthentication: verifies that the JWT was issued by Keycloak and has the correct audience.

This works because every protected pod runs an Envoy sidecar that can enforce those Layer 7 policies directly on the pod.

In **Istio Ambient Mesh** the sidecar disappears, Layer 7 checks run on a **Waypoint proxy** that sits between the `ztunnel` (Layer 4) and the workload. Simply re‑using the existing workload‑scoped policies in Ambient leads to two critical problems:

1. **Policies miss their target**: `AuthorizationPolicy` and `RequestAuthentication` bound to pods are ignored, denying all traffic.
2. **Timing gaps**: Even when teams manually create a Waypoint, traffic can reach the Service before the Waypoint and its policies are ready, briefly exposing the workload.

We need to extend the operator so that it can:

1. Detect whether a Package is running in **sidecar** or **ambient** mode.
2. Provision a Waypoint when **Ambient + Authservice** are both requested.
3. Attach `AuthorizationPolicy` and `RequestAuthentication` to the **Waypoint** (instead of the workload).
4. Sequence resource creation so that the workload is never reachable without protection.
5. Keep the existing sidecar workflow unchanged for apps that are not using Ambient.

## Proposal

Extend the UDS Operator to provision **one dedicated Waypoint per UDSPackage** *only* when an Authservice‑protected workload runs in Ambient. The operator will:

1. **Ensure all relevant Services and Pods/Deployments are properly labeled** with `istio.io/use-waypoint` pointing to the correct Waypoint.
2. **Update the operator to reconcile based on both Package and resource lifecycle events.**
3. **Mutate Services and Workloads during admission** when possible.
4. **Reconcile missing labels post-deployment** using the Package as the source of truth for authorization needs.
5. **Gate policy enforcement on label presence** to ensure protection only activates after the necessary resources are present.

## Scope and Requirements

- **Automated provisioning**: One Waypoint per UDSPackage *only* when needed, ensuring isolation between packages.
    - The RequestAuthentication resource will be scoped to the Authservice client via an audience claim. Allowing for multiple waypoint configurations in a single namespace if necessary.
- **Operator‑owned lifecycle**: Create, update, delete all related Kubernetes objects.
- **Safe rollout**: Services are annotated *after* Waypoint readiness; automatic rollback on error.
- **Backward compatibility**: Sidecar clusters and unprotected workloads remain unaffected.
- **No extra config**: Developers keep using the existing `serviceMesh.mode: ambient` and `enableAuthserviceSelector` fields, nothing new to add to the CR.
- **Isolation**: Each package gets its own dedicated waypoint, providing better isolation between applications.
- **Default‑deny friendly**: Generated NetworkPolicies ensure traffic follows `ztunnel → Waypoint → Pod` only.
- **Definition of Done**:
    1. Design doc approved by the UDS Foundations Team
    2. CI E2E test: JWT‑protected call succeeds, unauthenticated call fails.
    3. Manual smoke test documented.
    4. Release notes and operator docs updated (maybe include diagram of visualization below)

## Implementation Details

### Resource Labeling

- **Gateway resource**: Created per package with a unique name based on the package name (`<package-name>-waypoint`).
    - This label means that the waypoint is configured for both workload and service resources. Required so that we can protect both in-cluster and pod ip traffic with their respective labels.
- **Workload labels**: Set `istio.io/use-waypoint: <waypoint-name>`.
    - A workload label provides protection at the POD IP level, adding an additional layer of L7 protection so that requests directly to the pod IP flow through the waypoint.
- **Service labels**: Set `istio.io/use-waypoint: <waypoint-name>` and `istio.io/ingress-use-waypoint: "true"`
    - A service label ensures that in-cluster traffic targeting the service is routed through the waypoint before reaching the pod.

### Operator Reconciliation Strategy

### Ambient and Authservice Enabled Packages

When a Package is applied with `spec.network.serviceMesh.mode=ambient` and has `spec.sso[].enableAuthserviceSelector` set, the operator will:

1. Reconcile the namespace and create the necessary Gateway and policy resources.
2. Mutate new Services and Pods/Deployments via webhook to inject the `istio.io/use-waypoint` label.
3. Reconcile all known Services and Workloads to ensure the correct labels are present, even if created prior to the Package.

### Avoiding Timing Gaps

To address the critical timing issue of a Service becoming reachable **before** the Waypoint and policies are ready:

- **Admission webhook** instantly applies the required label if the Service matches a known Package during creation.
- **The operator delays authorization policy installation until after the Service is labeled and the Gateway is ready:**
    - The operator creates the Gateway immediately upon detecting a Package that enables both Ambient mode and Authservice protection. It then installs the `RequestAuthentication`, `DENY`, and `CUSTOM` AuthorizationPolicies targeting that Gateway, these are valid even if no Service yet exists.
    - The operator extracts and stores the selectors from the Package CR to track which Services and workloads should be labeled for protection. If matching resources are created later, the admission webhook will catch and label them instantly. If the webhook misses, reconciliation logic will ensure labels are eventually applied.
    - This strategy guarantees that by the time a Service is routable, it is already protected by a live Waypoint with active policies. The presence of the Gateway and policies is decoupled from the Service lifecycle, avoiding timing gaps that could expose workloads.
    - Additionally, because this is for Packages with authservice clients, the creation of the client will also provide additional processing time where the Service can come up.
- **External delay** introduced during SSO client creation provides a natural buffer before real requests reach the Service.
- In tandem, the reconcile loop ensures eventual consistency, retroactively applying labels and policies if the webhook missed something.

This approach ensures a Service cannot become publicly routable without protection, either it’s labeled at creation and protected, or reconciliation catches up before the system is usable.

### Workflow Summary

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: authservice-test-app-waypoint
  namespace: httpbin-test
  labels:
    istio.io/waypoint-for: all
spec:
  gatewayClassName: istio-waypoint
  listeners:
  - name: mesh
    port: 15008
    protocol: HBONE
---
apiVersion: security.istio.io/v1beta1
kind: RequestAuthentication
metadata:
  name: httpbin-jwt
  namespace: httpbin-test
spec:
  targetRef:
    - kind: Gateway
      group: gateway.networking.k8s.io
      name: authservice-test-app-waypoint
  jwtRules:
    - issuer: "https://sso.uds.dev/realms/uds"
      jwksUri: "http://keycloak-http.keycloak.svc.cluster.local:8080/realms/uds/protocol/openid-connect/certs"
---
apiVersion: security.istio.io/v1beta1
kind: AuthorizationPolicy
metadata:
  name: deny-unauth
  namespace: httpbin-test
spec:
  action: DENY
  targetRef:
    - kind: Gateway
      group: gateway.networking.k8s.io
      name: authservice-test-app-waypoint
  rules:
    - from:
      - source:
          notRequestPrincipals:
            - "https://sso.uds.dev/realms/uds/*"
---
apiVersion: security.istio.io/v1
kind: AuthorizationPolicy
metadata:
  name: uds-core-httpbin-authservice
  namespace: httpbin-test
spec:
  action: CUSTOM
  provider:
    name: authservice
  rules:
  - to:
    - operation:
        notPaths:
        - /stats/prometheus
        notPorts:
        - "15020"
    when:
    - key: request.headers[authorization]
      notValues:
      - '*'
  targetRef:
    - kind: Gateway
      group: gateway.networking.k8s.io
      name: authservice-test-app-waypoint
```

1. Package is applied.
2. When a Package is reconciled, the operator evaluates if:
    - `spec.network.serviceMesh.mode=ambient`
    - `spec.sso[].enableAuthserviceSelector` is non-empty

        ```
        apiVersion: uds.dev/v1alpha1
        kind: Package
        metadata:
          name: httpbin-other
          namespace: authservice-test-app
        spec:
          sso:
            - name: Demo SSO
              clientId: uds-core-httpbin
              redirectUris:
                - "https://protected.uds.dev/login"
              enableAuthserviceSelector:
                app: httpbin
          network:
            serviceMesh:
              mode: ambient
            expose:
              - service: httpbin
                selector:
                  app: httpbin
                gateway: tenant
                host: protected
                port: 8000
                targetPort: 80
        ```

3. If both are true:
    - Create a Gateway (`<namespace+application>-waypoint`), and apply necessary policies (RequestAuthentication, DENY, CUSTOM).

        ```
        apiVersion: gateway.networking.k8s.io/v1
        kind: Gateway
        metadata:
          name: authservice-test-app-waypoint
          namespace: httpbin-test
          labels:
            istio.io/waypoint-for: all
        spec:
          gatewayClassName: istio-waypoint
          listeners:
          - name: mesh
            port: 15008
            protocol: HBONE
        ---
        apiVersion: security.istio.io/v1beta1
        kind: RequestAuthentication
        metadata:
          name: httpbin-jwt
          namespace: httpbin-test
        spec:
          targetRef:
            - kind: Gateway
              group: gateway.networking.k8s.io
              name: authservice-test-app-waypoint
          jwtRules:
            - issuer: "https://sso.uds.dev/realms/uds"
              jwksUri: "http://keycloak-http.keycloak.svc.cluster.local:8080/realms/uds/protocol/openid-connect/certs"
              audiences:
                - "uds-core-httpbin"
        ---
        apiVersion: security.istio.io/v1beta1
        kind: AuthorizationPolicy
        metadata:
          name: deny-unauth
          namespace: httpbin-test
        spec:
          action: DENY
          targetRef:
            - kind: Gateway
              group: gateway.networking.k8s.io
              name: authservice-test-app-waypoint
          rules:
            - from:
              - source:
                  notRequestPrincipals:
                    - "https://sso.uds.dev/realms/uds/*"
        ---
        apiVersion: security.istio.io/v1
        kind: AuthorizationPolicy
        metadata:
          name: uds-core-httpbin-authservice
          namespace: httpbin-test
        spec:
          action: CUSTOM
          provider:
            name: authservice
          rules:
          - to:
            - operation:
                notPaths:
                - /stats/prometheus
                notPorts:
                - "15020"
            when:
            - key: request.headers[authorization]
              notValues:
              - '*'
          targetRef:
            - kind: Gateway
              group: gateway.networking.k8s.io
              name: authservice-test-app-waypoint
        ```

    - Label any matching Services and Deployments/Pods
    - Mutate new Services/Pods with the label via webhook.

        ```yaml
        apiVersion: v1
        kind: Service
        metadata:
          name: httpbin-test
          namespace: httpbin-test
          labels:
            [istio.io/use-waypoint:](http://istio.io/use-waypoint:) authservice-test-app-waypoint
            istio.io/ingress-use-waypoint: "true"
        spec:
          selector:
            app: httpbin-test
          ports:
            - name: http
              port: 8081
              targetPort: 80
        ```
        apiVersion: v1
        kind: Pod
        metadata:
          annotations:
            ambient.istio.io/redirection: enabled
          labels:
            app: httpbin-test
            istio.io/use-waypoint: authservice-test-app-waypoint
          name: httpbin-test
          namespace: httpbin-test
        spec:
          containers:
          - image: 127.0.0.1:31999/kong/httpbin:0.2.3-zarf-1909157879
            imagePullPolicy: IfNotPresent
            name: httpbin
            ports:
            - containerPort: 80
              protocol: TCP
            resources: {}
            securityContext:
              allowPrivilegeEscalation: false
              capabilities:
                add:
                - NET_BIND_SERVICE
                drop:
                - ALL
              privileged: false
              runAsGroup: 10001
              runAsNonRoot: true
              runAsUser: 10001
        ```

4. Authorization enforcement is tied to label presence and Waypoint readiness, protecting the app **only once** both are true.

### Upgrading Existing Deployments

- The operator will detect pre-existing deployments in ambient namespaces that match the authservice selector and ensure that:
    - Gateway and policies are provisioned.
    - Workloads and Services receive appropriate labels via reconciliation.

### Additional Considerations

- The mutation webhook is scoped for Service and Pod resources.
- The operator will support relabeling logic even if the user deploys only a Pod and not a Deployment.
- Events are emitted on both success and error to aid debugging.



### Example Manifests and Steps for testing this functionality

    The operator will replace the management of these manifests and their labels and the end user will only have to supply the package. The following steps:

    1. The operator will replace the management of these manifests and their labels and the end user will only have to supply the package. The following steps:
    2. `*uds run test-single-layer --set LAYER=monitoring --set FLAVOR=unicorn`* 
    3. `uds run -f src/test/tasks.yaml create-deploy`
    4. Login to Keycloak admin portal and update the `uds-core-httpbin` client to increase the session timeouts to 1 day
    5. Create Test user in keycloak admin portal
    6. Go to [protected.uds.dev](http://protected.uds.dev) and login with test user
        1. Should have authservice configured in debug mode
    7. grab test users JWT token from authservice logs
    8. Apply the manifest below `k apply -f <manifest>` 
    9. Shell into grafana pod, curl httpbin-test service `*curl -v -i http://httpbin-test.httpbin-test.svc.cluster.local:8081/*`
        1. should get a 403 Forbidden because of unauthenticated request
    10. Export JWT in grafana terminal `export JWT=<jwt>` 
    11. `*curl -v -i -H "Authorization: Bearer $JWT" http://httpbin-test.httpbin-test.svc.cluster.local:8081/*`
        1. Should receive a 200 response because request is authenticated
    12. Also test the pod IP, get the IP from the httpbin-test pod
        1. `curl -v -i http://<httpbin-test-pod-ip>:80/` 
        2. `*curl -v -i -H "Authorization: Bearer $JWT" http://<httpbin-test-pod-ip>:80/`* 

    ```yaml
    apiVersion: v1
    kind: Service
    metadata:
      name: httpbin-test
      namespace: httpbin-test
      labels:
        istio.io/use-waypoint: authservice-test-app-waypoint
        istio.io/ingress-use-waypoint: "true"
    spec:
      selector:
        app: httpbin-test
      ports:
        - name: http
          port: 8081
          targetPort: 80
    ---
    apiVersion: apps/v1
    kind: Deployment
    metadata:
      name: httpbin-test
      namespace: httpbin-test
    spec:
      replicas: 1
      selector:
        matchLabels:
          app: httpbin-test
      template:
        metadata:
          labels:
            app: httpbin-test
            istio.io/use-waypoint: authservice-test-app-waypoint
        spec:
          containers:
            - image: docker.io/kong/httpbin:0.2.3
              imagePullPolicy: IfNotPresent
              name: httpbin
              ports:
                - containerPort: 80
              securityContext:
                allowPrivilegeEscalation: false
                privileged: false
                runAsGroup: 10001
                runAsNonRoot: true
                runAsUser: 10001
                capabilities:
                  drop:
                    - ALL
                  add:
                    - NET_BIND_SERVICE
    ---
    apiVersion: networking.k8s.io/v1
    kind: NetworkPolicy
    metadata:
      name: allow-grafana-egress-httpbin
      namespace: grafana
    spec:
      podSelector:
        matchLabels:
          app.kubernetes.io/name: grafana
      policyTypes:
      - Egress
      egress:
      - to:
        - namespaceSelector:
            matchLabels:
              kubernetes.io/metadata.name: httpbin-test
    ---
    apiVersion: gateway.networking.k8s.io/v1
    kind: Gateway
    metadata:
      name: authservice-test-app-waypoint
      namespace: httpbin-test
      labels:
        istio.io/waypoint-for: all
    spec:
      gatewayClassName: istio-waypoint
      listeners:
      - name: mesh
        port: 15008
        protocol: HBONE
    ---
    apiVersion: security.istio.io/v1beta1
    kind: RequestAuthentication
    metadata:
      name: httpbin-jwt
      namespace: httpbin-test
    spec:
      targetRef:
        - kind: Gateway
          group: gateway.networking.k8s.io
          name: authservice-test-app-waypoint
      jwtRules:
        - issuer: "https://sso.uds.dev/realms/uds"
          jwksUri: "http://keycloak-http.keycloak.svc.cluster.local:8080/realms/uds/protocol/openid-connect/certs"
    ---
    apiVersion: security.istio.io/v1beta1
    kind: AuthorizationPolicy
    metadata:
      name: deny-unauth
      namespace: httpbin-test
    spec:
      action: DENY
      targetRef:
        - kind: Gateway
          group: gateway.networking.k8s.io
          name: authservice-test-app-waypoint
      rules:
        - from:
          - source:
              notRequestPrincipals:
                - "https://sso.uds.dev/realms/uds/*"
    ---
    apiVersion: security.istio.io/v1
    kind: AuthorizationPolicy
    metadata:
      name: uds-core-httpbin-authservice
      namespace: httpbin-test
    spec:
      action: CUSTOM
      provider:
        name: authservice
      rules:
      - to:
        - operation:
            notPaths:
            - /stats/prometheus
            notPorts:
            - "15020"
        when:
        - key: request.headers[authorization]
          notValues:
          - '*'
      targetRef:
        - kind: Gateway
          group: gateway.networking.k8s.io
          name: authservice-test-app-waypoint
    ---
    apiVersion: networking.istio.io/v1
    kind: VirtualService
    metadata:
      name: httpbin-test-8081
      namespace: httpbin-test
    spec:
      gateways:
      - istio-tenant-gateway/tenant-gateway
      hosts:
      - protected.uds.dev
      http:
      - route:
        - destination:
            host: httpbin-test.httpbin-test.svc.cluster.local
            port:
              number: 8081
    ---
    apiVersion: networking.istio.io/v1
    kind: VirtualService
    metadata:
      name: httpbin-other-tenant-protected-8000-httpbin
      namespace: authservice-test-app
    spec:
      gateways:
      - istio-tenant-gateway/tenant-gateway
      hosts:
      - protected1.uds.dev
      http:
      - route:
        - destination:
            host: httpbin.authservice-test-app.svc.cluster.local
            port:
              number: 8000
    ```

We're refactoring the ambient waypoint package management in the Istio operator to:

One Waypoint per Package (instead of per namespace)
Each UDS package gets its own dedicated waypoint
Enables better isolation and management of mixed authentication applications
Kubernetes Owner References
All waypoint resources (Gateways, RequestAuthentications, AuthorizationPolicies) are owned by their parent UDSPackage
Kubernetes garbage collection automatically cleans up resources when packages are deleted
Reduces manual cleanup logic and potential resource leaks
Improved Resource Management
Standardized labeling with uds/ prefix
Consistent app.kubernetes.io/managed-by: uds-operator label
Better traceability with package and namespace labels
Simplified Cleanup
Delete the waypoint gateway, and let Kubernetes handle the rest
Reduced complexity and improved reliability


```bash
# update src/istio/zarf.yaml to include the following:
#
#  - name: gateway-api-crds
#    required: true
#    import:
#    path: common

uds run dev-setup
npx pepr dev --confirm # in new terminal
zarf dev deploy src/keycloak --flavor upstream
# port forward keycloak in k9s with shift+f
zarf dev deploy src/authservice --flavor upstream
zarf dev deploy src/test --flavor upstream
zarf p ls # view packages deployed
zarf p remove uds-core-test-apps --confirm
```