:msg-announcement: @[name] and <!subteam^S0873DLTGLF> :uds: are pleased to announce *UDS Core 1.7.0* 1.7.0

*Included Changes:*
This release includes new features and dependency updates. You can view the full release notes on the docs site <https://docs.defenseunicorns.com/core/operations/release-notes/1-7/|here>.

Some particular changes of note:

 • *Envoy Gateway component:* UDS Core ships a new optional Envoy Gateway component in the standard package. It deploys the Envoy Gateway controller v1.8.0 and creates a `GatewayClass` named `envoy-gateway`. Opt in via `optionalComponents` in your bundle configuration. Available in upstream, registry1, and unicorn flavors.
 • *Package CR expose annotations:* `expose` entries in the `Package` CR now accept an `annotations` map for consumer-extensible per-endpoint metadata. Enables richer integration points such as Portal visibility and title customization without separate mechanisms.
 • *Falco Helm chart 9.x:* Falco updated from 0.43.1 to 0.44.1 with a major Helm chart upgrade from 8.0.2 to 9.1.0.

As per usual please reach out in <#C06QJAUHWFN|product-support> if you encounter any issues consuming this release.

*Link:*
:github: This release can be found <https://github.com/defenseunicorns/uds-core/releases/tag/v1.7.0|here>

If you have any feedback or want to discuss further, please put it in :thread: :point_down:
