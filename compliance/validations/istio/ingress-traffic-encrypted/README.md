# README.md

**NAME** - ingress-traffic-encrypted

**INPUT** - This validation collects all Istio gateways in the Kubernetes cluster.

**POLICY** - This policy checks that all gateways encrypt ingress traffic, except for the "istio-passthrough-gateway/passthrough-gateway".

**NOTES** - The server spec in the gateways must have a `port.protocol` set to `HTTPS` and `tls.httpsRedirect` set to `true` OR `port.protocol` set to `HTTPS` and `tls.mode` either `SIMPLE` or `OPTIONAL_MUTUAL`.