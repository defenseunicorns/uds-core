## Istio Ambient

### TLDR

Migrating applications to ambient was surprisingly painless and removed more complexity than it added. At least initially we were pessimistic about the pain to migrate but were impressed how much complexity fell out when many of the quirks of istio sidecars are removed.

We came away more optimistic about ambient and would advocate that further engineer effort be devoted to pursuing it as viable future default.

### Benefits

- Our current pain points with Istio sidecars (job termination and init containers mTLS traffic) become non-issues with Ambient
- The prometheus stack setup with mTLS metrics can be simplified significantly with Ambient on prometheus, we no longer require mutations or certificate mounting to properly scape endpoints.
- Ambient is able to handle direct pod addressability in a way that sidecars weren't, allowing us to remove some workarounds previously required (headless services)
- By removing the sidecars from most workloads we are able to reduce the resource footprint, especially for large scale clusters with lots of workloads on top of core
- Speed of startup as well as pod communications is increased due to the removal of sidecars (there is no longer a bottleneck to communications and pods do not have to wait on sidecars during startup)

### Interesting Notes

- Traffic to keycloak from Pepr originated from a "different" host, requiring a new trusted host policy in Keycloak for `*.pepr-uds-core-watcher.pepr-system.svc.cluster.local` (better than the original 127.0.0.6)
- A number of PERMISSIVE peer authentications we used for "Kube API" -> svc traffic (webhooks and api services) seem to be unnecessary with ambient
- Switching to Ambient requires a few new Istio components which do not have (working) images in Ironbank or Chainguard
- Using L7 features in Ambient mode depends on adoption of K8s Gateway API specification

### Future Work/Mysteries

- Evaluate existing netpol L3/4, find comparable istio authorization policy implementations (also reevaluate default netpols for istiod, etc)
  - Package CR support for authorization policies at L4/7
  - Can we map existing network.allow from netpol -> authpolicy
- Encountered odd behavior with kubeapi - unsure if actually fixed?
- How should we handle Istio needing exemptions now (reorder pepr/istio, exemption CRD deployed pre-core, etc)
- How do we handle mission apps with authservice (require sidecar OR figure out extAuthz with waypoint)
- Keycloak and Authservice "required" sidecars to get them functional - could this be addressed by waypoints or other config we were missing?
- Gateway API instead of Ingress Gateway + VirtualService - unsure if this is connected to some of the issues we encountered with authz
- Istio ambient may need some specific configuration depending on cluster type (we had to pass in certain values for the CNI to work on [k3s](https://istio.io/latest/docs/ambient/install/platform-prerequisites/#k3s))
- Narrow down Istio CNI/Ztunnel exemption to what is strictly necessary
