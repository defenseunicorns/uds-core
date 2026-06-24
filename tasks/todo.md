# CORE-604: BCFKS truststore for Keycloak

- [x] Add `generate-bcfks-truststore` init container (after uds-config) using Keycloak image
- [x] Mount providers, data, conf, ca-certs (+ implicit SA token) in init container
- [x] Init script: collect certs (conf/truststores, /tmp/ca-certs, SA ca.crt), split bundles, build BCFKS, clear conf/truststores
- [x] Remove `--truststore-paths` arg from keycloak container
- [x] Add `--truststore-kubernetes-enabled=false` (critical: prevents TruststoreBuilder PKCS12 via auto-included k8s CA)
- [x] Set JAVA_OPTS_APPEND with javax.net.ssl.trustStore{,Type,Password} (+ keep FIPS JCE override for cgr.dev)
- [x] Keep migration deleteGeneratedTrustStore cleanup (already handles .bcfks)
- [x] Update kc_truststore_paths_test.yaml (BCFKS) + kc_fips_jce_security_test.yaml
- [x] helm unittest src/keycloak/chart passes (99/99)
- [ ] Commit (no co-author, no push)
