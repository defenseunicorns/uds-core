## Istio Ambient

Things we had to do:
- Trusted hosts: *.pepr-uds-core-watcher.pepr-system.svc.cluster.local

### Benefits

- sidecar job killing - not necessary for ambient apps
- prometheus stack setup - simplified significantly with ambient on prometheus, no mutations/cert mounting required
- able to delete a number of headless services and PERMISSIVE peer authentications
- resources?
- speed?

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
