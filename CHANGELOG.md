# Changelog

All notable changes to this project will be documented in this file.

> [!IMPORTANT]
> This changelog only tracks changes across minor versions and is automatically generated, ensuring all commits are captured. The [GitHub Releases](https://github.com/defenseunicorns/uds-core/releases) provide a summary of changes for each release and list all patch releases as well.

## [0.61.0](https://github.com/defenseunicorns/uds-core/compare/v0.60.0...v0.61.0) (2026-02-10)


### Features

* add blackbox exporter to uds-core as optional component ([#2314](https://github.com/defenseunicorns/uds-core/issues/2314)) ([2f08ee5](https://github.com/defenseunicorns/uds-core/commit/2f08ee59d8ae89a72b534967cc42ed69e4769d95))
* automount uds trust bundle to all applications ([#2337](https://github.com/defenseunicorns/uds-core/issues/2337)) ([ce66203](https://github.com/defenseunicorns/uds-core/commit/ce662038b19e83cb298356d0eb2207975a940086))
* cluster-less crd pipeline ([#2316](https://github.com/defenseunicorns/uds-core/issues/2316)) ([5128ffb](https://github.com/defenseunicorns/uds-core/commit/5128ffb64186d547f2fd577985f22619495b9089))
* improve Keycloak availability ([#2334](https://github.com/defenseunicorns/uds-core/issues/2334)) ([a306465](https://github.com/defenseunicorns/uds-core/commit/a306465ea54d0207d502eff289c3dc2882417f45))


### Bug Fixes

* cleanup zarf --no-progress deprecation ([#2352](https://github.com/defenseunicorns/uds-core/issues/2352)) ([78d3b15](https://github.com/defenseunicorns/uds-core/commit/78d3b15b8612cc9ba404cbb0173a03cb3ae51e25))
* ensure ambient mode is the default in all operator code ([#2326](https://github.com/defenseunicorns/uds-core/issues/2326)) ([bda5384](https://github.com/defenseunicorns/uds-core/commit/bda5384adce387707b43a0af3bc294e9f0b87894))
* multiarch script output ([#2338](https://github.com/defenseunicorns/uds-core/issues/2338)) ([457d9b3](https://github.com/defenseunicorns/uds-core/commit/457d9b34601efcf380b9c116d5fad4d87962f94c))
* validate authservice callback uri + redirect uri ([#2349](https://github.com/defenseunicorns/uds-core/issues/2349)) ([0ae9121](https://github.com/defenseunicorns/uds-core/commit/0ae9121170e7275242fe27c08f1259240f3ed957))


### Miscellaneous

* bump eks/aks k8s to 1.34 ([#2339](https://github.com/defenseunicorns/uds-core/issues/2339)) ([4145337](https://github.com/defenseunicorns/uds-core/commit/4145337e10d9c4a45ec4c62a25d9012f13c81396))
* crd versioning adr ([#2308](https://github.com/defenseunicorns/uds-core/issues/2308)) ([f1e5a86](https://github.com/defenseunicorns/uds-core/commit/f1e5a86171b46e3b36a6f5465f35057f1f602b5e))
* **deps:** bump @isaacs/brace-expansion from 5.0.0 to 5.0.1 ([#2336](https://github.com/defenseunicorns/uds-core/issues/2336)) ([5db96c7](https://github.com/defenseunicorns/uds-core/commit/5db96c7db7b2ee571b65724fa52059b1aabf40db))
* **deps:** bump lodash from 4.17.21 to 4.17.23 ([#2319](https://github.com/defenseunicorns/uds-core/issues/2319)) ([ad29405](https://github.com/defenseunicorns/uds-core/commit/ad294051338ddff1109c82dd40ec3ef1660a9c9d))
* **deps:** update grafana ([#2257](https://github.com/defenseunicorns/uds-core/issues/2257)) ([74ad882](https://github.com/defenseunicorns/uds-core/commit/74ad882df4fa9fb3f20fe4bb1b01b9d2505dc6de))
* **deps:** update keycloak to v26.5.2 ([#2297](https://github.com/defenseunicorns/uds-core/issues/2297)) ([e393a3d](https://github.com/defenseunicorns/uds-core/commit/e393a3d08968a673c8c28c9e5a63dcc324aa1ae7))
* **deps:** update loki ([#2265](https://github.com/defenseunicorns/uds-core/issues/2265)) ([e12859b](https://github.com/defenseunicorns/uds-core/commit/e12859b344a45ebc6aaee8914b25ff307466ce21))
* **deps:** update metrics-server to v0.8.1 ([#2324](https://github.com/defenseunicorns/uds-core/issues/2324)) ([a48c45a](https://github.com/defenseunicorns/uds-core/commit/a48c45a41663bbb919cb6dc026a493cb9817ab54))
* **deps:** update pepr to v1.0.8 ([#2320](https://github.com/defenseunicorns/uds-core/issues/2320)) ([b4b1b48](https://github.com/defenseunicorns/uds-core/commit/b4b1b48085b1faa63a0109a5e77c82771fae9a81))
* **deps:** update vector ([#2315](https://github.com/defenseunicorns/uds-core/issues/2315)) ([872f083](https://github.com/defenseunicorns/uds-core/commit/872f083068706ef5d54afbbdba8976cdf0a89a92))
* remove deprecated devDep for root-ca script ([#2342](https://github.com/defenseunicorns/uds-core/issues/2342)) ([616fbdb](https://github.com/defenseunicorns/uds-core/commit/616fbdb345155e617cc0b1e8b4deebd5ede4e815))
* update uds package icon to new doug logo ([#2353](https://github.com/defenseunicorns/uds-core/issues/2353)) ([77150aa](https://github.com/defenseunicorns/uds-core/commit/77150aa684dfc583af0c3787276bd91fbd908d38))


### Documentation

* add clarity on label placement for reload ([#2330](https://github.com/defenseunicorns/uds-core/issues/2330)) ([1a2515f](https://github.com/defenseunicorns/uds-core/commit/1a2515f0d201e13dc70180af503183048d84af31))
* fix broken link and adjust markdown annotation ([#2331](https://github.com/defenseunicorns/uds-core/issues/2331)) ([5d542a3](https://github.com/defenseunicorns/uds-core/commit/5d542a309dcb1abc3f74c91c57eb6d5dd5016ed9))

## [0.60.0](https://github.com/defenseunicorns/uds-core/compare/v0.59.0...v0.60.0) (2026-01-29)


### ⚠ BREAKING CHANGES

* istio service mesh ambient mode default ([#2287](https://github.com/defenseunicorns/uds-core/issues/2287))

### Features

* add helm chart to deploy uds exemptions; add istio gateway nodeport default exemption ([#2277](https://github.com/defenseunicorns/uds-core/issues/2277)) ([1c7d4e1](https://github.com/defenseunicorns/uds-core/commit/1c7d4e14d3e8301a007bd6fa66b103e1b4efb2ef))
* add new package sso secret fields ([#2264](https://github.com/defenseunicorns/uds-core/issues/2264)) ([2ba486d](https://github.com/defenseunicorns/uds-core/commit/2ba486df4b9ba180cd5ee37e6d65d3e616cb2a99))
* istio service mesh ambient mode default ([#2287](https://github.com/defenseunicorns/uds-core/issues/2287)) ([5d38301](https://github.com/defenseunicorns/uds-core/commit/5d3830163fa8a8bdb6e3a6b2fa389125adb377ed))
* keycloak logout confirmation ([#2260](https://github.com/defenseunicorns/uds-core/issues/2260)) ([d1529a8](https://github.com/defenseunicorns/uds-core/commit/d1529a887b459bddfff0ae7826df875825d6f06b))
* scope uds core operator pepr rbac ([#2307](https://github.com/defenseunicorns/uds-core/issues/2307)) ([5016d6f](https://github.com/defenseunicorns/uds-core/commit/5016d6f8702a1ffeff5df810ebdc25721ce5d688))
* unify trust bundle management across istio, authservice, and uds packages ([#2281](https://github.com/defenseunicorns/uds-core/issues/2281)) ([447c2ad](https://github.com/defenseunicorns/uds-core/commit/447c2ad47169952bea0d20d9b8854c81656e3c33))


### Bug Fixes

* broken dev setup because of missing trust bundle initialization ([#2313](https://github.com/defenseunicorns/uds-core/issues/2313)) ([4411d40](https://github.com/defenseunicorns/uds-core/commit/4411d401c205a3a7f89cd08303b7de9a14aa5352))
* invalid Example UDS Package CR documentation ([#2321](https://github.com/defenseunicorns/uds-core/issues/2321)) ([9f86be9](https://github.com/defenseunicorns/uds-core/commit/9f86be9a33353a6f924fd2a89993cfd5e80ba812))
* remove null storage class ([#2296](https://github.com/defenseunicorns/uds-core/issues/2296)) ([c548517](https://github.com/defenseunicorns/uds-core/commit/c548517d352417bcf266edc4aa52f6e1711f6a88))
* switch grafana sidecars to native k8s sidecars ([#2266](https://github.com/defenseunicorns/uds-core/issues/2266)) ([fcb2eed](https://github.com/defenseunicorns/uds-core/commit/fcb2eed46bca8ae4e0bde62a962424ff6c0ffb16))


### Miscellaneous

* add lula mapping ([#2255](https://github.com/defenseunicorns/uds-core/issues/2255)) ([988b540](https://github.com/defenseunicorns/uds-core/commit/988b540ef54f5778bbb9b49131d390a186b80861))
* add lula mapping ([#2294](https://github.com/defenseunicorns/uds-core/issues/2294)) ([4213fcb](https://github.com/defenseunicorns/uds-core/commit/4213fcb557a89d25e5f757e3fb793fe3f8100111))
* add mappings ([#2286](https://github.com/defenseunicorns/uds-core/issues/2286)) ([ca6a8fd](https://github.com/defenseunicorns/uds-core/commit/ca6a8fda5c3204bebed3bb54037f7529acb984bb))
* add multiarch checks to release pipeline ([#2303](https://github.com/defenseunicorns/uds-core/issues/2303)) ([1d1a826](https://github.com/defenseunicorns/uds-core/commit/1d1a826ef54b68d6ee7697eb153f7a3707a44a93))
* bump IAC clusters to k8s 1.34 ([#2299](https://github.com/defenseunicorns/uds-core/issues/2299)) ([e86ef82](https://github.com/defenseunicorns/uds-core/commit/e86ef823dc0e394b39e1dfd07fd69b5932b852ac))
* **deps-dev:** bump lodash from 4.17.21 to 4.17.23 in /test/vitest ([#2295](https://github.com/defenseunicorns/uds-core/issues/2295)) ([5318f02](https://github.com/defenseunicorns/uds-core/commit/5318f028ff8dd6f230a245bf1c00a58310bf68a0))
* **deps:** update istio to 1.28.2 ([#2238](https://github.com/defenseunicorns/uds-core/issues/2238)) ([825c1ed](https://github.com/defenseunicorns/uds-core/commit/825c1ed6ea58df6432080174408528915ea0059c))
* **deps:** update istio to v1.28.3 ([#2285](https://github.com/defenseunicorns/uds-core/issues/2285)) ([fd9dd2c](https://github.com/defenseunicorns/uds-core/commit/fd9dd2c5d1f4027eb085113e007839db5befb546))
* **deps:** update keycloak ([#2256](https://github.com/defenseunicorns/uds-core/issues/2256)) ([41fff8c](https://github.com/defenseunicorns/uds-core/commit/41fff8c19f881f41b886423c1ce7f3f971bebfe0))
* **deps:** update pepr to v1.0.7 ([#2282](https://github.com/defenseunicorns/uds-core/issues/2282)) ([46d18f4](https://github.com/defenseunicorns/uds-core/commit/46d18f4656cc47a316210a68032d8630df855f8c))
* **deps:** update prometheus to 3.9.1, alertmanager to 0.30.1, and operator to 0.88.0 ([#2241](https://github.com/defenseunicorns/uds-core/issues/2241)) ([d693441](https://github.com/defenseunicorns/uds-core/commit/d6934412e1e688f5edd38b6facbec376c7bc173b))
* **deps:** update uds-identity-config v0.23.0 ([#2300](https://github.com/defenseunicorns/uds-core/issues/2300)) ([13370d5](https://github.com/defenseunicorns/uds-core/commit/13370d561cfe92fdd74410984038e811a8df8251))
* **deps:** update velero ([#2158](https://github.com/defenseunicorns/uds-core/issues/2158)) ([10e720b](https://github.com/defenseunicorns/uds-core/commit/10e720b10093906614d531552d88b2c26d3d75c2))
* mappings for compliance 853 ([#2258](https://github.com/defenseunicorns/uds-core/issues/2258)) ([e1faad7](https://github.com/defenseunicorns/uds-core/commit/e1faad7c16d632106ba08f44043ad46a102c8287))
* pin bottlerocket eks to 1.53.0 ([#2323](https://github.com/defenseunicorns/uds-core/issues/2323)) ([9c5f383](https://github.com/defenseunicorns/uds-core/commit/9c5f383f52fd34d77b1c97bd7134a90c38b588c7))
* revert pepr to v1.0.4 and Kubernetes to 1.33 ([#2318](https://github.com/defenseunicorns/uds-core/issues/2318)) ([7cea4d8](https://github.com/defenseunicorns/uds-core/commit/7cea4d867f5681fa74e9f8a72b3013100eb82528))
* update k8s-sidecar to 2.4.0, switch unicorn back to hardened ([#2298](https://github.com/defenseunicorns/uds-core/issues/2298)) ([f39019c](https://github.com/defenseunicorns/uds-core/commit/f39019cbda7705664c3f52c3a593646fa362e8e4))
* update mapping uuid that was misaligned ([#2301](https://github.com/defenseunicorns/uds-core/issues/2301)) ([02e769b](https://github.com/defenseunicorns/uds-core/commit/02e769baddc9a5010d192218793f6afa2409c018))


### Documentation

* **adr:** add uds core deprecation policy ([#2261](https://github.com/defenseunicorns/uds-core/issues/2261)) ([aaa7951](https://github.com/defenseunicorns/uds-core/commit/aaa7951c8a5f99db027df0b799420f25f1ab54fb))
* **adr:** define cluster-less crd workflow ([#2270](https://github.com/defenseunicorns/uds-core/issues/2270)) ([c383f11](https://github.com/defenseunicorns/uds-core/commit/c383f110b140cba5327b4f56020e261d4497b6c3))
* update backporting doc ([#2275](https://github.com/defenseunicorns/uds-core/issues/2275)) ([8b36d2a](https://github.com/defenseunicorns/uds-core/commit/8b36d2ac47f230cc21469ec7a434ef91ff60e00d))
* update session management doc ([#2276](https://github.com/defenseunicorns/uds-core/issues/2276)) ([5bd4092](https://github.com/defenseunicorns/uds-core/commit/5bd409208963f1e040449a1d882e7b92c325b39d))

## [0.59.0](https://github.com/defenseunicorns/uds-core/compare/v0.58.0...v0.59.0) (2026-01-13)


### Features

* centralized ambient egress ([#2194](https://github.com/defenseunicorns/uds-core/issues/2194)) ([ea5ccbc](https://github.com/defenseunicorns/uds-core/commit/ea5ccbcb86d2738a04c998212c8a26df290d9dec))


### Bug Fixes

* add wait condition for checkpoint deploy ([#2223](https://github.com/defenseunicorns/uds-core/issues/2223)) ([4ed4d01](https://github.com/defenseunicorns/uds-core/commit/4ed4d0166bb2336e06f2ba7f309d163d8adeab47))
* backport task and github workflows ([#2230](https://github.com/defenseunicorns/uds-core/issues/2230)) ([b3190bf](https://github.com/defenseunicorns/uds-core/commit/b3190bf5df8273430b87fe31782091c2687fe6af))
* downgrade k8s-sidecar for Grafana to 1.30.10, pin helm unittest install ([#2219](https://github.com/defenseunicorns/uds-core/issues/2219)) ([d78eecd](https://github.com/defenseunicorns/uds-core/commit/d78eecd959b5861b1a329a9e74e7175354740058))


### Miscellaneous

* add clarification on internal interface ([#2259](https://github.com/defenseunicorns/uds-core/issues/2259)) ([833c8bc](https://github.com/defenseunicorns/uds-core/commit/833c8bc03e154102bf648b29081563915fa0f206))
* add lula mapping ([#2244](https://github.com/defenseunicorns/uds-core/issues/2244)) ([2d49dc3](https://github.com/defenseunicorns/uds-core/commit/2d49dc3d9c1dc70860fd6d4908e5ead559755d3a))
* add lula mapping ([#2253](https://github.com/defenseunicorns/uds-core/issues/2253)) ([1e1fda1](https://github.com/defenseunicorns/uds-core/commit/1e1fda10276bcb692ca341e006b024f0bb852194))
* add lula mappings ([#2248](https://github.com/defenseunicorns/uds-core/issues/2248)) ([d4a81a1](https://github.com/defenseunicorns/uds-core/commit/d4a81a1244516d51049506f6dc88782aecda6feb))
* add mappings for compliance 918 ([#2184](https://github.com/defenseunicorns/uds-core/issues/2184)) ([690e7f9](https://github.com/defenseunicorns/uds-core/commit/690e7f940819ea5baea79a0c0bbc088c3ac4ad97))
* **ci:** update aks iac ([#2222](https://github.com/defenseunicorns/uds-core/issues/2222)) ([e01d319](https://github.com/defenseunicorns/uds-core/commit/e01d319cee59a29a359e7da208bbbc617ac0cac0))
* **deps:** bump qs from 6.14.0 to 6.14.1 ([#2239](https://github.com/defenseunicorns/uds-core/issues/2239)) ([2630119](https://github.com/defenseunicorns/uds-core/commit/2630119b1654992361f9f0056fa6bc9f0e7199fd))
* **deps:** update authservice to v1.1.5 ([#2232](https://github.com/defenseunicorns/uds-core/issues/2232)) ([5d36ab6](https://github.com/defenseunicorns/uds-core/commit/5d36ab6f33e7c7a02b5760547736799a8cb317be))
* **deps:** update grafana ([#2206](https://github.com/defenseunicorns/uds-core/issues/2206)) ([82e0291](https://github.com/defenseunicorns/uds-core/commit/82e0291b84141e4c9b8ddaddadca55fd70a90e6d))
* **deps:** update keycloak to v26.5.0 ([#2243](https://github.com/defenseunicorns/uds-core/issues/2243)) ([66fc3e1](https://github.com/defenseunicorns/uds-core/commit/66fc3e1787936913acad5fba86c549ff458eb5da))
* **deps:** update loki ([#2208](https://github.com/defenseunicorns/uds-core/issues/2208)) ([8bb80b4](https://github.com/defenseunicorns/uds-core/commit/8bb80b43d98973f058d695e8f0817faeeb7c2046))
* **deps:** update pepr to v1.0.4 ([#2233](https://github.com/defenseunicorns/uds-core/issues/2233)) ([dcefad9](https://github.com/defenseunicorns/uds-core/commit/dcefad95b150140e18ae4c9020f98abffedd3a7a))
* **deps:** update prometheus-stack ([#2216](https://github.com/defenseunicorns/uds-core/issues/2216)) ([c58dcbd](https://github.com/defenseunicorns/uds-core/commit/c58dcbdcdc029fd5786e1c7ad9599197463bb9f5))
* **deps:** update support-deps ([#2220](https://github.com/defenseunicorns/uds-core/issues/2220)) ([96ea9f8](https://github.com/defenseunicorns/uds-core/commit/96ea9f8b3f1be6c58764630fdea9f5edfe0bbd76))
* **deps:** update support-deps ([#2246](https://github.com/defenseunicorns/uds-core/issues/2246)) ([92e9596](https://github.com/defenseunicorns/uds-core/commit/92e9596f681243bfb41474feb6f775f083855d62))
* **deps:** update vector to 0.52.0 ([#2221](https://github.com/defenseunicorns/uds-core/issues/2221)) ([c802b2e](https://github.com/defenseunicorns/uds-core/commit/c802b2ea3b616243298dc91c64ced70a85434218))
* **docs:** url updates from org move ([#2231](https://github.com/defenseunicorns/uds-core/issues/2231)) ([2185bd9](https://github.com/defenseunicorns/uds-core/commit/2185bd98a6b7bbfbeb6b40ec41e0ca8749d3085e))
* switch to iso timestamps for pepr logs, redact config log ([#2242](https://github.com/defenseunicorns/uds-core/issues/2242)) ([b35c56d](https://github.com/defenseunicorns/uds-core/commit/b35c56d204da1d32ec464a482a9db4b4d95ff321))
* update crds for new headers ([#2240](https://github.com/defenseunicorns/uds-core/issues/2240)) ([08a6672](https://github.com/defenseunicorns/uds-core/commit/08a6672a9fb2bca8122cb8f36fc74dd9020a14f2))
* update mappings ([#2236](https://github.com/defenseunicorns/uds-core/issues/2236)) ([b92cf7a](https://github.com/defenseunicorns/uds-core/commit/b92cf7aa261206252ebd5fe8bf8d13b72b82e2e3))


### Documentation

* multiple audiences for Keycloak Clients ([#2218](https://github.com/defenseunicorns/uds-core/issues/2218)) ([ab1993a](https://github.com/defenseunicorns/uds-core/commit/ab1993a3fbb0713e311bea72e6cad20b6c03d08a))
* updating velero AWS policy with cluster tag ([#2234](https://github.com/defenseunicorns/uds-core/issues/2234)) ([4146b5d](https://github.com/defenseunicorns/uds-core/commit/4146b5da2122b2d513036f80a845fe7c94d8949a))

## [0.58.0](https://github.com/defenseunicorns/uds-core/compare/v0.57.0...v0.58.0) (2025-12-15)


### ⚠ BREAKING CHANGES

* Keycloak Horizontal Pod Autoscaler (HPA) configuration has been changed. The minimum number of replicas has been lowered to 2, whereas the maximum has been set to 5. The values have been calculated based on [Keycloak Performance Benchmarks](https://www.keycloak.org/2025/10/keycloak-benchmark).

### Features

* add centralized trust bundle cert management ([#2167](https://github.com/defenseunicorns/uds-core/issues/2167)) ([0608373](https://github.com/defenseunicorns/uds-core/commit/060837314a77d85f1456775eec08e23d24947403))
* add support for metrics collection on authservice protected services ([#2166](https://github.com/defenseunicorns/uds-core/issues/2166)) ([240248e](https://github.com/defenseunicorns/uds-core/commit/240248e59d9a8b563a78259bd9e90af078d73aeb))
* automount uds trust bundle to keycloak/grafana ([#2212](https://github.com/defenseunicorns/uds-core/issues/2212)) ([6d3ff5b](https://github.com/defenseunicorns/uds-core/commit/6d3ff5b4275f61b03a9e7e403b0a38278e122cde))
* clarify keycloak scaling down issues ([#2191](https://github.com/defenseunicorns/uds-core/issues/2191)) ([3ec1401](https://github.com/defenseunicorns/uds-core/commit/3ec1401102203cce08ca0fd903a82316454fd39f))
* inline overrides for T&C in Keycloak ([#2214](https://github.com/defenseunicorns/uds-core/issues/2214)) ([0950998](https://github.com/defenseunicorns/uds-core/commit/09509986d392c215b0bbaefa6e37a36b2bd83042))
* keycloak HA guide and sizing (https://github.com/defenseunicorns/uds-core/pull/2200) ([ed08ad8](https://github.com/defenseunicorns/uds-core/commit/ed08ad84f9f7f8120fa5ed37e6e014c3e68aec11))


### Bug Fixes

* ambient authservice validation use curl and retries ([#2202](https://github.com/defenseunicorns/uds-core/issues/2202)) ([289d07f](https://github.com/defenseunicorns/uds-core/commit/289d07fdb26d6c421540c63101026d2c212d3a37))
* **ci:** add podinfo host for iac ([#2199](https://github.com/defenseunicorns/uds-core/issues/2199)) ([bc8577d](https://github.com/defenseunicorns/uds-core/commit/bc8577dc28df48c4c9c413c0ff38e32f0086399a))
* **ci:** switch to example curl for egress test ([#2195](https://github.com/defenseunicorns/uds-core/issues/2195)) ([7fc8404](https://github.com/defenseunicorns/uds-core/commit/7fc8404f9408680f112b07e1982fffe0721dba92))
* enable iptables reconcile on startup for istio-cni ([#2204](https://github.com/defenseunicorns/uds-core/issues/2204)) ([f91ff5a](https://github.com/defenseunicorns/uds-core/commit/f91ff5af19d6b0f175afc7fee7e594708b6ff1ba))
* gracefully handle missing uds-ca-certs configmap ([#2211](https://github.com/defenseunicorns/uds-core/issues/2211)) ([658a493](https://github.com/defenseunicorns/uds-core/commit/658a49303da2468eb0bd988f5a30c9f380eb9868))
* renovate matching for falco rules ([#2188](https://github.com/defenseunicorns/uds-core/issues/2188)) ([d8ee391](https://github.com/defenseunicorns/uds-core/commit/d8ee391889506da38c46fafe9721f85cd84a94a5))


### Miscellaneous

* add broken link checker for docs ([#2180](https://github.com/defenseunicorns/uds-core/issues/2180)) ([03994ee](https://github.com/defenseunicorns/uds-core/commit/03994ee86166f3185f772b04d514c13a4b3b8050))
* add logging on watch events for admission watches ([#2215](https://github.com/defenseunicorns/uds-core/issues/2215)) ([b729b57](https://github.com/defenseunicorns/uds-core/commit/b729b5781fcc95b409ef773c77de8600463d478c))
* add zarf connect for prometheus and alertmanager ([#2186](https://github.com/defenseunicorns/uds-core/issues/2186)) ([7e6fc12](https://github.com/defenseunicorns/uds-core/commit/7e6fc12331e324e50bdb8b0ce8e3e6c4c2350037))
* adjust polling for loki integration tests/add debug output for cm/secrets ([#2201](https://github.com/defenseunicorns/uds-core/issues/2201)) ([2eb992f](https://github.com/defenseunicorns/uds-core/commit/2eb992f25a614bb03a53fe4c946fde378f347fad))
* **ci:** add more debug on IAC, update AKS deprecations ([#2205](https://github.com/defenseunicorns/uds-core/issues/2205)) ([703e376](https://github.com/defenseunicorns/uds-core/commit/703e376bb4614074652d2c61909ebca6b9fe4fd6))
* **deps:** update authservice to 1.1.2 ([#2160](https://github.com/defenseunicorns/uds-core/issues/2160)) ([7c7c973](https://github.com/defenseunicorns/uds-core/commit/7c7c973c51c9a811e06c2993ac3ceacadbe78331))
* **deps:** update authservice to v1.1.4 ([#2192](https://github.com/defenseunicorns/uds-core/issues/2192)) ([f471eb9](https://github.com/defenseunicorns/uds-core/commit/f471eb913d6873a0e6cb7cc167dca088432d0259))
* **deps:** update falco helm chart to 7.0.2, rules to latest ([#2171](https://github.com/defenseunicorns/uds-core/issues/2171)) ([1ce34dd](https://github.com/defenseunicorns/uds-core/commit/1ce34dd83b6fbe5ccfb0e760a7b46a6ff876efa6))
* **deps:** update grafana ([#2075](https://github.com/defenseunicorns/uds-core/issues/2075)) ([682f51a](https://github.com/defenseunicorns/uds-core/commit/682f51a5e7fcab1d69607466cbca84810ab02fc9))
* **deps:** update istio to v1.28.0 ([#2113](https://github.com/defenseunicorns/uds-core/issues/2113)) ([e02f03d](https://github.com/defenseunicorns/uds-core/commit/e02f03d4b030827816f413b16c2e3e05ab72789b))
* **deps:** update istio to v1.28.1 ([#2197](https://github.com/defenseunicorns/uds-core/issues/2197)) ([f6825ad](https://github.com/defenseunicorns/uds-core/commit/f6825ad74f39333e78d8ec89e957569af94be3a9))
* **deps:** update keycloak to v26.4.7 ([#2182](https://github.com/defenseunicorns/uds-core/issues/2182)) ([2af1957](https://github.com/defenseunicorns/uds-core/commit/2af1957e0ff5f5575bb8c30f94173f4e6f74a274))
* **deps:** update loki to 3.6.2 ([#2143](https://github.com/defenseunicorns/uds-core/issues/2143)) ([99bdd40](https://github.com/defenseunicorns/uds-core/commit/99bdd4018be71c9615d07514b5e6ed9a7c0ba398))
* **deps:** update pepr to v1.0.2 ([#2183](https://github.com/defenseunicorns/uds-core/issues/2183)) ([411e22b](https://github.com/defenseunicorns/uds-core/commit/411e22bb13b2b06c2fbfe3788be1dedcfc40378d))
* **deps:** update prometheus-stack ([#2163](https://github.com/defenseunicorns/uds-core/issues/2163)) ([6c8b611](https://github.com/defenseunicorns/uds-core/commit/6c8b61122f0db400477573dcd359bee9c8891685))
* **deps:** update support-deps ([#2209](https://github.com/defenseunicorns/uds-core/issues/2209)) ([7d9eac7](https://github.com/defenseunicorns/uds-core/commit/7d9eac7d89c7ca21d3c2cfd3adc3f0732b680dd8))
* **deps:** update support-deps ([#2213](https://github.com/defenseunicorns/uds-core/issues/2213)) ([a74ab54](https://github.com/defenseunicorns/uds-core/commit/a74ab5411836a84eb3a09551d285791e2a3715e9))
* **deps:** update uds-identity-config to v0.22.0 ([#2210](https://github.com/defenseunicorns/uds-core/issues/2210)) ([9be0dae](https://github.com/defenseunicorns/uds-core/commit/9be0dae5d49e7bca2cd564855e7bed140027764f))
* mapping uds-compliance ([#2190](https://github.com/defenseunicorns/uds-core/issues/2190)) ([c9a363b](https://github.com/defenseunicorns/uds-core/commit/c9a363b31e5df932d886dbb7101b0a7f1e43f792))
* remove commscope cas from public trust bundle ([#2187](https://github.com/defenseunicorns/uds-core/issues/2187)) ([25ab754](https://github.com/defenseunicorns/uds-core/commit/25ab7546c56bf5ab06cb8285cc08cec211bb8a1a))

## [0.57.0](https://github.com/defenseunicorns/uds-core/compare/v0.56.0...v0.57.0) (2025-12-02)


### Features

* add settings for keycloak waypoint deployment template ([#2137](https://github.com/defenseunicorns/uds-core/issues/2137)) ([771e0fb](https://github.com/defenseunicorns/uds-core/commit/771e0fbc524ed702c0bf4788b84c9b720c5ae105))
* adding custom pod annotations to keycloak statefulset ([#2138](https://github.com/defenseunicorns/uds-core/issues/2138)) ([900a47f](https://github.com/defenseunicorns/uds-core/commit/900a47f673c670fc15903935b6792638a033c6ae))
* configurable uds hardening ([#2153](https://github.com/defenseunicorns/uds-core/issues/2153)) ([6282444](https://github.com/defenseunicorns/uds-core/commit/6282444ebc6eac13da2726c63f5dfca8af67e63c))
* configurable username in user self-registration ([#2134](https://github.com/defenseunicorns/uds-core/issues/2134)) ([23c6039](https://github.com/defenseunicorns/uds-core/commit/23c6039bea51e64ee5e987ba4cbb551bbfbb1cfd))
* expose temporary lockout for keycloak configuration ([#2149](https://github.com/defenseunicorns/uds-core/issues/2149)) ([ad3805f](https://github.com/defenseunicorns/uds-core/commit/ad3805f848d36b69ba0f95576d0c7a3bfb215107))
* support backport/patch releases ([#2144](https://github.com/defenseunicorns/uds-core/issues/2144)) ([f9df72d](https://github.com/defenseunicorns/uds-core/commit/f9df72deb5ac79b3e920636800dc2afd388bef96))


### Bug Fixes

* add conflict resolution for EKS VPC CNI ([#2147](https://github.com/defenseunicorns/uds-core/issues/2147)) ([6a3dda9](https://github.com/defenseunicorns/uds-core/commit/6a3dda9353a00e50cfacd737e76998a4cb39e783))
* decouple istio-cni and zarf cluster components ([#2152](https://github.com/defenseunicorns/uds-core/issues/2152)) ([4499961](https://github.com/defenseunicorns/uds-core/commit/4499961141df73c74f12b1664c58467636da3819))
* install/use proper deps for check-ca-certs task ([#2173](https://github.com/defenseunicorns/uds-core/issues/2173)) ([429de08](https://github.com/defenseunicorns/uds-core/commit/429de085f128fce7b2048e9737fcea9a776b6d14))


### Miscellaneous

* add ca-cert-retrieval script ([#2131](https://github.com/defenseunicorns/uds-core/issues/2131)) ([c546134](https://github.com/defenseunicorns/uds-core/commit/c54613486817e5062f1906ac9f5082af1eeaf29d))
* add ci space cleanup to slim-dev test ([#2150](https://github.com/defenseunicorns/uds-core/issues/2150)) ([a17b512](https://github.com/defenseunicorns/uds-core/commit/a17b5120e434d4fab6d2c9ee07f90ada8346b31a))
* add lula mappings ([#2129](https://github.com/defenseunicorns/uds-core/issues/2129)) ([ddcaab4](https://github.com/defenseunicorns/uds-core/commit/ddcaab4b45b51155a166d5db77b0ac4875fe2a2d))
* add lula mappings ([#2141](https://github.com/defenseunicorns/uds-core/issues/2141)) ([a12108f](https://github.com/defenseunicorns/uds-core/commit/a12108f2e2f0267d4a6a5866ef3ad2aa0721bc0a))
* add lula mappings ([#2156](https://github.com/defenseunicorns/uds-core/issues/2156)) ([679d197](https://github.com/defenseunicorns/uds-core/commit/679d197bfa18669be4c6fd3f16037447ccc224b7))
* **ci:** add debug output for network tests ([#2168](https://github.com/defenseunicorns/uds-core/issues/2168)) ([2649090](https://github.com/defenseunicorns/uds-core/commit/2649090fff7085b6cbcec5d31c23a47d15a9fdef))
* **ci:** add debug output on failure to remaining network tests ([#2174](https://github.com/defenseunicorns/uds-core/issues/2174)) ([bbd40e5](https://github.com/defenseunicorns/uds-core/commit/bbd40e53c7d67f92607fed5a0784ef2196ae0c7d))
* corresponding pr for uds-compliace issue 661 ([#2155](https://github.com/defenseunicorns/uds-core/issues/2155)) ([ed5d693](https://github.com/defenseunicorns/uds-core/commit/ed5d693b6285ad8d60bc4a3440503e22290d00c6))
* **deps-dev:** bump js-yaml from 4.1.0 to 4.1.1 in /test/vitest ([#2146](https://github.com/defenseunicorns/uds-core/issues/2146)) ([2b89cad](https://github.com/defenseunicorns/uds-core/commit/2b89cad224e826f8fa507e00e7433a6b2ea0debf))
* **deps:** bump body-parser from 2.2.0 to 2.2.1 ([#2170](https://github.com/defenseunicorns/uds-core/issues/2170)) ([4ef40f0](https://github.com/defenseunicorns/uds-core/commit/4ef40f0031fcc5decf92f80e46ef105e8f392768))
* **deps:** bump js-yaml from 4.1.0 to 4.1.1 ([#2151](https://github.com/defenseunicorns/uds-core/issues/2151)) ([99c9c2e](https://github.com/defenseunicorns/uds-core/commit/99c9c2e2552c7bf7a47f14ebee2855aa51434dc1))
* **deps:** update falco ([#2117](https://github.com/defenseunicorns/uds-core/issues/2117)) ([0797db9](https://github.com/defenseunicorns/uds-core/commit/0797db9151616bb314050dd68360895d38c2def7))
* **deps:** update keycloak to 26.4.6, identity-config to 0.21.0 ([#2172](https://github.com/defenseunicorns/uds-core/issues/2172)) ([eb68f18](https://github.com/defenseunicorns/uds-core/commit/eb68f18b7e6be9a1a72f6483b41961ee24d25926))
* **deps:** update keycloak to v26.4.5 ([#2133](https://github.com/defenseunicorns/uds-core/issues/2133)) ([4617543](https://github.com/defenseunicorns/uds-core/commit/4617543617bc8ad64319bddc6d5f00bf7ecf1720))
* **deps:** update loki ([#2076](https://github.com/defenseunicorns/uds-core/issues/2076)) ([6661056](https://github.com/defenseunicorns/uds-core/commit/6661056f1148e4552cabf9806365ab4fcb9f2337))
* **deps:** update pepr to v1.0.1 ([#2148](https://github.com/defenseunicorns/uds-core/issues/2148)) ([9dde05e](https://github.com/defenseunicorns/uds-core/commit/9dde05eb93c04c079406fda82449038628dde0fc))
* **deps:** update prometheus-stack ([#2056](https://github.com/defenseunicorns/uds-core/issues/2056)) ([143338f](https://github.com/defenseunicorns/uds-core/commit/143338f75ba9e5d169cbbd07f6605a0016729894))
* **deps:** update vector ([#2106](https://github.com/defenseunicorns/uds-core/issues/2106)) ([4078521](https://github.com/defenseunicorns/uds-core/commit/4078521607ce837a17067db0dad3f01f825b250b))
* **deps:** update vector ([#2139](https://github.com/defenseunicorns/uds-core/issues/2139)) ([b1a5374](https://github.com/defenseunicorns/uds-core/commit/b1a5374eb0b73aef4f33f1f6036c9e1418b1a185))
* **deps:** update velero ([#2018](https://github.com/defenseunicorns/uds-core/issues/2018)) ([b60ca73](https://github.com/defenseunicorns/uds-core/commit/b60ca730f0bf1e2f7c454e8278a5d28d45b591e7))
* making the experimental gateway-api-crds the default ([#2165](https://github.com/defenseunicorns/uds-core/issues/2165)) ([a6e74b2](https://github.com/defenseunicorns/uds-core/commit/a6e74b28fd84f72427c04ef5e631ff5f81715a31))
* mappings for uds-compliance-653 ([#2082](https://github.com/defenseunicorns/uds-core/issues/2082)) ([96612b1](https://github.com/defenseunicorns/uds-core/commit/96612b1bec2decd6f09a57e91e82870f53b8dee7))
* removing patch after upstream fix ([#2145](https://github.com/defenseunicorns/uds-core/issues/2145)) ([0f981f8](https://github.com/defenseunicorns/uds-core/commit/0f981f816b2469cc0e6641bc959b3f466e5dd404))

## [0.56.0](https://github.com/defenseunicorns/uds-core/compare/v0.55.1...v0.56.0) (2025-11-12)


### ⚠ BREAKING CHANGES

* remove neuvector and require falco ([#2083](https://github.com/defenseunicorns/uds-core/issues/2083))

### Features

* conditional access request notes ([#2116](https://github.com/defenseunicorns/uds-core/issues/2116)) ([73cef02](https://github.com/defenseunicorns/uds-core/commit/73cef02c7333b5bafa9f290fefc8300b92b2a49f))
* remove neuvector and require falco ([#2083](https://github.com/defenseunicorns/uds-core/issues/2083)) ([e43bcc3](https://github.com/defenseunicorns/uds-core/commit/e43bcc3bde2eca1de63dce073d99141a9b180a72))


### Bug Fixes

* **docs:** broken link in sso overview ([#2114](https://github.com/defenseunicorns/uds-core/issues/2114)) ([6738d42](https://github.com/defenseunicorns/uds-core/commit/6738d427bd64774008b971b4510f8617b0394fdb))
* install test apps preupgrade and validate ([#2088](https://github.com/defenseunicorns/uds-core/issues/2088)) ([ed1211a](https://github.com/defenseunicorns/uds-core/commit/ed1211af6bcf78ed347546a730f0dd63f3388f27))
* prevent network policies from selecting non-authservice SSO clients ([#2127](https://github.com/defenseunicorns/uds-core/issues/2127)) ([b95d997](https://github.com/defenseunicorns/uds-core/commit/b95d997f338f7ca34f7e4f592f9d6cb4b6761092))


### Miscellaneous

* add lula compliance mapping ([#2049](https://github.com/defenseunicorns/uds-core/issues/2049)) ([23d0163](https://github.com/defenseunicorns/uds-core/commit/23d0163b208f9dd238654ca3f4ead65ce1230c2a))
* add lula mappings ([#2119](https://github.com/defenseunicorns/uds-core/issues/2119)) ([b8a5811](https://github.com/defenseunicorns/uds-core/commit/b8a581118fb83428abf42fe73b2dee2e4417cda8))
* add lula mappings for controls ([#2102](https://github.com/defenseunicorns/uds-core/issues/2102)) ([3855b53](https://github.com/defenseunicorns/uds-core/commit/3855b539094633cde7e8cf92abecb20ff949518a))
* add observability reference architecture docs ([#1987](https://github.com/defenseunicorns/uds-core/issues/1987)) ([afdac07](https://github.com/defenseunicorns/uds-core/commit/afdac07613560a38062001bdccd31167324f672a))
* cleanup unused oscal/lula1 tasks ([#2122](https://github.com/defenseunicorns/uds-core/issues/2122)) ([fd5c767](https://github.com/defenseunicorns/uds-core/commit/fd5c767fb7207648db94d509384961223022eec9))
* **deps:** update keycloak ([#2124](https://github.com/defenseunicorns/uds-core/issues/2124)) ([6a2097b](https://github.com/defenseunicorns/uds-core/commit/6a2097bab2268ccf29dc81e969641445319dd029))
* **deps:** update keycloak to v26.4.2 ([#2061](https://github.com/defenseunicorns/uds-core/issues/2061)) ([5dd5cf8](https://github.com/defenseunicorns/uds-core/commit/5dd5cf8f8cce5639e841158a97fd3e71faec8b32))
* **deps:** update keycloak to v26.4.4 ([#2130](https://github.com/defenseunicorns/uds-core/issues/2130)) ([f0563a6](https://github.com/defenseunicorns/uds-core/commit/f0563a6e6f85e5007212e51b2f2334ba82806d3d))
* **deps:** update pepr to v1 ([#2118](https://github.com/defenseunicorns/uds-core/issues/2118)) ([8cf4543](https://github.com/defenseunicorns/uds-core/commit/8cf4543c19a10de259f92621906e206af409943f))
* **deps:** update support-deps ([#2128](https://github.com/defenseunicorns/uds-core/issues/2128)) ([ba26eed](https://github.com/defenseunicorns/uds-core/commit/ba26eed7a029120bf6cbd19f072dda53b7d6cceb))
* **docs:** add doc warning around remoteHost egress ([#2104](https://github.com/defenseunicorns/uds-core/issues/2104)) ([3d9bce5](https://github.com/defenseunicorns/uds-core/commit/3d9bce56c0d751aa5d6d85239cba674c8a7e43a5))
* **docs:** remove neuvector docs ([#2095](https://github.com/defenseunicorns/uds-core/issues/2095)) ([29e92a1](https://github.com/defenseunicorns/uds-core/commit/29e92a1c33c3fef4b3fbab1fef4d74839cb9d98b))
* **docs:** update diagrams ([#2109](https://github.com/defenseunicorns/uds-core/issues/2109)) ([ee2a67d](https://github.com/defenseunicorns/uds-core/commit/ee2a67d8dd94a28d3d537935c37a65eff73edbd8))
* **docs:** update likec4 diagram ([#2108](https://github.com/defenseunicorns/uds-core/issues/2108)) ([b90df25](https://github.com/defenseunicorns/uds-core/commit/b90df2559490799e1d7dabe7ccb3d7b3f680e565))
* fix spelling in name of file ([#2112](https://github.com/defenseunicorns/uds-core/issues/2112)) ([bfe818c](https://github.com/defenseunicorns/uds-core/commit/bfe818c1a1f1e1a382b5ca3bb00b85414a57c3c8))
* fix test task to check authservice protection ([#2121](https://github.com/defenseunicorns/uds-core/issues/2121)) ([81d4d34](https://github.com/defenseunicorns/uds-core/commit/81d4d345ac411934f573ca7acf0dfef742b06842))
* lula annotations ([#2074](https://github.com/defenseunicorns/uds-core/issues/2074)) ([03d497d](https://github.com/defenseunicorns/uds-core/commit/03d497d718edb6b535af43a76be425540381a77a))
* mappings ([#2123](https://github.com/defenseunicorns/uds-core/issues/2123)) ([91d3756](https://github.com/defenseunicorns/uds-core/commit/91d37563a1c4f83d17a097d8ab78e83f0d1e394e))
* update to uds-k3d 0.19.1, remove uds-dev-stack exemption ([#2098](https://github.com/defenseunicorns/uds-core/issues/2098)) ([1f33957](https://github.com/defenseunicorns/uds-core/commit/1f33957f9e23921465137024285718f652ceff86))

## [0.55.1](https://github.com/defenseunicorns/uds-core/compare/v0.55.0...v0.55.1) (2025-11-03)


### Bug Fixes

* **docs:** diagram task setup fix ([#2097](https://github.com/defenseunicorns/uds-core/issues/2097)) ([c413e22](https://github.com/defenseunicorns/uds-core/commit/c413e22f7bdee20fa7acac29893f36709fa5cf4d))


### Miscellaneous

* **ci:** remove iptables from save-logs ([#2096](https://github.com/defenseunicorns/uds-core/issues/2096)) ([155bfa9](https://github.com/defenseunicorns/uds-core/commit/155bfa98be2b9f667f8bea578be1ed14f843aa4e))
* **config:** migrate renovate config ([#2084](https://github.com/defenseunicorns/uds-core/issues/2084)) ([d54c18b](https://github.com/defenseunicorns/uds-core/commit/d54c18b0a89a20d8c9fcdd6cd9880d75a5db297b))
* **deps-dev:** bump vite from 7.1.7 to 7.1.12 in /docs/.c4 ([#2089](https://github.com/defenseunicorns/uds-core/issues/2089)) ([bb5b631](https://github.com/defenseunicorns/uds-core/commit/bb5b631b5066d91025bbbb9399c3e99f4f598a0f))
* **deps:** update falco ([#2052](https://github.com/defenseunicorns/uds-core/issues/2052)) ([f65f042](https://github.com/defenseunicorns/uds-core/commit/f65f0429ab7c42d408f5167459ef143044c99653))
* **docs:** diagrams as code with likec4 ([#2000](https://github.com/defenseunicorns/uds-core/issues/2000)) ([b41e3b2](https://github.com/defenseunicorns/uds-core/commit/b41e3b21dab126c6628058f94c2fee6f878739cd))
* make private-pki task macos compatible ([#2081](https://github.com/defenseunicorns/uds-core/issues/2081)) ([2478065](https://github.com/defenseunicorns/uds-core/commit/24780657d73b30d1e87aec049ba1de15ba0d0ac1))
* rotate development uds.dev certs ([#2100](https://github.com/defenseunicorns/uds-core/issues/2100)) ([5307bd4](https://github.com/defenseunicorns/uds-core/commit/5307bd42d3995634a354ccda436e1a5a37eb821d))
* update renovate for likec4 ([#2093](https://github.com/defenseunicorns/uds-core/issues/2093)) ([eac3d36](https://github.com/defenseunicorns/uds-core/commit/eac3d36a5b4a6377d4177384f932374b22834ba8))

## [0.55.0](https://github.com/defenseunicorns/uds-core/compare/v0.54.1...v0.55.0) (2025-10-28)


### Features

* pod reload on configmaps and falco separated configmaps ([#2057](https://github.com/defenseunicorns/uds-core/issues/2057)) ([005e0d8](https://github.com/defenseunicorns/uds-core/commit/005e0d807ffcd279d64e3ec85f06eaad86390093))
* uds-identity-config registry1 image ([#2045](https://github.com/defenseunicorns/uds-core/issues/2045)) ([4595a9b](https://github.com/defenseunicorns/uds-core/commit/4595a9bb4f5b5b05267478cf64d827b2d5bb30e6))


### Bug Fixes

* add retries to all network tests ([#2066](https://github.com/defenseunicorns/uds-core/issues/2066)) ([4f701d9](https://github.com/defenseunicorns/uds-core/commit/4f701d957bfab02d798c1c530780ebeaec39f41b))
* add retries to network tests ([#2055](https://github.com/defenseunicorns/uds-core/issues/2055)) ([e301432](https://github.com/defenseunicorns/uds-core/commit/e301432cd3406069d42b116c3dcc8b4f3a554511))
* add script for checking unicorn multiarch images ([#2047](https://github.com/defenseunicorns/uds-core/issues/2047)) ([22c50a7](https://github.com/defenseunicorns/uds-core/commit/22c50a75f84bb21689ee7d0f1e375a7ae7037755))
* falco disable configmap naming ([#2080](https://github.com/defenseunicorns/uds-core/issues/2080)) ([4021587](https://github.com/defenseunicorns/uds-core/commit/402158792713da853e00ab0730431c3f1cf65250))
* fixed keycloak credentials recovery procedure ([#2038](https://github.com/defenseunicorns/uds-core/issues/2038)) ([65747cb](https://github.com/defenseunicorns/uds-core/commit/65747cbf9ddac815f33f00d133af21955fb7eb6f))
* keycloak spi envs syntax ([#2041](https://github.com/defenseunicorns/uds-core/issues/2041)) ([b4f568f](https://github.com/defenseunicorns/uds-core/commit/b4f568f3a9581530bfc264ae61b467a38f34943e))
* keycloak statefulset spi provider syntax ([#2030](https://github.com/defenseunicorns/uds-core/issues/2030)) ([0214dec](https://github.com/defenseunicorns/uds-core/commit/0214dec14adf4038ca943af714f9817017da3dd8))
* local velero crd manifests ([#2060](https://github.com/defenseunicorns/uds-core/issues/2060)) ([63f95c1](https://github.com/defenseunicorns/uds-core/commit/63f95c166c64ccf84cb85701e79a06e2323c7b32))
* remove setting --blocking-factor=64 when extracting the checkpoint image ([#2033](https://github.com/defenseunicorns/uds-core/issues/2033)) ([388d6b5](https://github.com/defenseunicorns/uds-core/commit/388d6b5d0509514a9ba8f2728398d4d9e5331e27))
* renovate readiness check unicorn pepr image version ([#2062](https://github.com/defenseunicorns/uds-core/issues/2062)) ([8ad67ca](https://github.com/defenseunicorns/uds-core/commit/8ad67ca7566a369177301287f9af8c802ca5bcda))
* revert statefulset change ([#2037](https://github.com/defenseunicorns/uds-core/issues/2037)) ([3abd38e](https://github.com/defenseunicorns/uds-core/commit/3abd38e99bb6bf5d2bc83815eff9de324e576d15))


### Miscellaneous

* add lula mappings for compliance pr ([#2034](https://github.com/defenseunicorns/uds-core/issues/2034)) ([15b41b6](https://github.com/defenseunicorns/uds-core/commit/15b41b60b8bca1caacd06335902ffc1cdb98cc36))
* add/update lula mapping keycloak observability ([#2044](https://github.com/defenseunicorns/uds-core/issues/2044)) ([91f4c21](https://github.com/defenseunicorns/uds-core/commit/91f4c21ad77cf2557ea4d388970d41847e0602c3))
* bump version references ([#2067](https://github.com/defenseunicorns/uds-core/issues/2067)) ([da828f9](https://github.com/defenseunicorns/uds-core/commit/da828f9d6c2f529f0edebbbb87d9b2a949e1b6c1))
* **ci:** handle timing with pepr joining the mesh ([#2040](https://github.com/defenseunicorns/uds-core/issues/2040)) ([5e93bf0](https://github.com/defenseunicorns/uds-core/commit/5e93bf030b1da5bc2b3900d2d6e9400378799751))
* **deps-dev:** bump vite from 7.1.5 to 7.1.11 in /test/vitest ([#2051](https://github.com/defenseunicorns/uds-core/issues/2051)) ([6551c5a](https://github.com/defenseunicorns/uds-core/commit/6551c5a3a435b9737815a7c99874f23cd2279472))
* **deps:** identity-config update to v0.19.1 ([#2073](https://github.com/defenseunicorns/uds-core/issues/2073)) ([953d1b4](https://github.com/defenseunicorns/uds-core/commit/953d1b409f58325558663738ae35eeb928b11508))
* **deps:** update falco chart to v6.4.0 ([#2010](https://github.com/defenseunicorns/uds-core/issues/2010)) ([02f454f](https://github.com/defenseunicorns/uds-core/commit/02f454f629d997fc887a188a0a395009ceeea170))
* **deps:** update grafana to 12.2.1 ([#2014](https://github.com/defenseunicorns/uds-core/issues/2014)) ([85ab191](https://github.com/defenseunicorns/uds-core/commit/85ab191f931999571353ec7b0cde24e92d7bda1e))
* **deps:** update istio to v1.27.3 ([#2017](https://github.com/defenseunicorns/uds-core/issues/2017)) ([cc07063](https://github.com/defenseunicorns/uds-core/commit/cc07063c79b6a8a5e25a072b89149bdbb1e6da6b))
* **deps:** update keycloak to v26.4.1 ([#2032](https://github.com/defenseunicorns/uds-core/issues/2032)) ([b495d7b](https://github.com/defenseunicorns/uds-core/commit/b495d7b1e78efa1704bded60855aada3fcaed6c0))
* **deps:** update loki to 3.5.7, nginx to 1.29.2 ([#1989](https://github.com/defenseunicorns/uds-core/issues/1989)) ([7b65aa4](https://github.com/defenseunicorns/uds-core/commit/7b65aa46028263b7f79e998fe92e9a2214be7de6))
* **deps:** update neuvector to 5.4.7 ([#2050](https://github.com/defenseunicorns/uds-core/issues/2050)) ([9ed8207](https://github.com/defenseunicorns/uds-core/commit/9ed8207d952aaa0fbe5e2487a614622667b6eb9d))
* **deps:** update pepr to v0.55.4 ([#2025](https://github.com/defenseunicorns/uds-core/issues/2025)) ([afa91fe](https://github.com/defenseunicorns/uds-core/commit/afa91fe6f0805f350c5fdd3de89d592c5bb5327b))
* **deps:** update pepr to v0.55.5 ([#2046](https://github.com/defenseunicorns/uds-core/issues/2046)) ([e2b6f95](https://github.com/defenseunicorns/uds-core/commit/e2b6f954f8ccf6cffb5c510fa4866c739b1ae640))
* **deps:** update pepr to v0.55.6 ([#2054](https://github.com/defenseunicorns/uds-core/issues/2054)) ([49ba35d](https://github.com/defenseunicorns/uds-core/commit/49ba35d3139df6ace7b5822b249d8e8aa4a85dab))
* **deps:** update pepr to v0.55.6 ([#2058](https://github.com/defenseunicorns/uds-core/issues/2058)) ([e454f59](https://github.com/defenseunicorns/uds-core/commit/e454f598b577c2850924f99728088222e5ee8297))
* **deps:** update prometheus-stack ([#1999](https://github.com/defenseunicorns/uds-core/issues/1999)) ([988955b](https://github.com/defenseunicorns/uds-core/commit/988955bba84e5fa997b316e105d7a661e081992b))
* **deps:** update support-deps ([#2069](https://github.com/defenseunicorns/uds-core/issues/2069)) ([948a73a](https://github.com/defenseunicorns/uds-core/commit/948a73a9ff679c5f5b9aa4e99b13c4e514e0069e))
* **deps:** update support-deps ([#2070](https://github.com/defenseunicorns/uds-core/issues/2070)) ([ad9d89e](https://github.com/defenseunicorns/uds-core/commit/ad9d89e6ab5c12356de20e6218d3c9a4ff571ad9))
* **deps:** update vitest v4.0.0 ([#2063](https://github.com/defenseunicorns/uds-core/issues/2063)) ([8869a6c](https://github.com/defenseunicorns/uds-core/commit/8869a6c39a812b01ac89bbc2218f4389e9ff855a))
* **docs:** add new doc for guide to keycloak customization ([#2048](https://github.com/defenseunicorns/uds-core/issues/2048)) ([0ac6588](https://github.com/defenseunicorns/uds-core/commit/0ac65882fc952e4a777ad288f6c4d3f8ac565f9d))
* **docs:** fix broken doc link ([#2077](https://github.com/defenseunicorns/uds-core/issues/2077)) ([02991b6](https://github.com/defenseunicorns/uds-core/commit/02991b62c36443ea5c896723c7716a1b647b863e))
* keycloak lula mappings ([#2012](https://github.com/defenseunicorns/uds-core/issues/2012)) ([1d217be](https://github.com/defenseunicorns/uds-core/commit/1d217be55f9f2ce5ea39c47a959d7c7579454990))
* keycloak lula mappings ([#2036](https://github.com/defenseunicorns/uds-core/issues/2036)) ([101326e](https://github.com/defenseunicorns/uds-core/commit/101326eb978a503a31e3804e302bc6400669767b))
* **test:** add private pki testing ([#2008](https://github.com/defenseunicorns/uds-core/issues/2008)) ([9bb5584](https://github.com/defenseunicorns/uds-core/commit/9bb55849ca4645717eac8d254a9e7e21129ccefe))
* uds-compliance-67-mappings ([#2024](https://github.com/defenseunicorns/uds-core/issues/2024)) ([2c4eb90](https://github.com/defenseunicorns/uds-core/commit/2c4eb90912d38f1a230a2393cf0625775c8576f0))


### Documentation

* fix badge for k3d ha test ([#2043](https://github.com/defenseunicorns/uds-core/issues/2043)) ([f98f9ee](https://github.com/defenseunicorns/uds-core/commit/f98f9ee808ec7da5aa5dcedb20cc1aa66f1c2f05))

## [0.54.1](https://github.com/defenseunicorns/uds-core/compare/v0.54.0...v0.54.1) (2025-10-15)


### Bug Fixes

* velero crd helm ownership ([#2029](https://github.com/defenseunicorns/uds-core/issues/2029)) ([8a3969c](https://github.com/defenseunicorns/uds-core/commit/8a3969c3ec3a644f556dae3ce9e9d1ab4786bcc0))


### Miscellaneous

* **docs:** add falco prerequisites section ([#2027](https://github.com/defenseunicorns/uds-core/issues/2027)) ([bb30ede](https://github.com/defenseunicorns/uds-core/commit/bb30edee03b9f8e41e7d2c676de5cf82c63b0fe3))
* uds-compliance-66 ([#2019](https://github.com/defenseunicorns/uds-core/issues/2019)) ([674334c](https://github.com/defenseunicorns/uds-core/commit/674334c0ab6c0dbec26e5e04254171d8cf438cbe))

## [0.54.0](https://github.com/defenseunicorns/uds-core/compare/v0.53.1...v0.54.0) (2025-10-14)


### Features

* keycloak log-based alerting ([#1974](https://github.com/defenseunicorns/uds-core/issues/1974)) ([7b58b19](https://github.com/defenseunicorns/uds-core/commit/7b58b19b54fc28f962c012521bab9debf962bd15))
* keycloak relies on Istio for mTLS ([#1993](https://github.com/defenseunicorns/uds-core/issues/1993)) ([c06d3ff](https://github.com/defenseunicorns/uds-core/commit/c06d3ff82c7fd99e726ee0b612d74c45a5250923))


### Bug Fixes

* velero crd upgrade process ([#2013](https://github.com/defenseunicorns/uds-core/issues/2013)) ([dd481a6](https://github.com/defenseunicorns/uds-core/commit/dd481a6b907f9a957f5509e9edec1809423420e7))


### Miscellaneous

* add icon annotations to packages ([#2007](https://github.com/defenseunicorns/uds-core/issues/2007)) ([11d1217](https://github.com/defenseunicorns/uds-core/commit/11d1217fffe4bd82ba91469e3ffbf5c612f6ba26))
* add lula compliance mapping for keycloak ([#2004](https://github.com/defenseunicorns/uds-core/issues/2004)) ([d028cb6](https://github.com/defenseunicorns/uds-core/commit/d028cb6121fce29d290caa244e9d2c2bf0847096))
* **deps:** update istio to 1.27.1 ([#1770](https://github.com/defenseunicorns/uds-core/issues/1770)) ([f35551b](https://github.com/defenseunicorns/uds-core/commit/f35551b3f301fff9e312426bc4af38babc54435e))
* **deps:** update istio to v1.4.0 ([#2002](https://github.com/defenseunicorns/uds-core/issues/2002)) ([2a9dd4e](https://github.com/defenseunicorns/uds-core/commit/2a9dd4e433ad8fe98f87cd6a33132bc8a2640b68))
* **deps:** update keycloak to v26.4.0 ([#1977](https://github.com/defenseunicorns/uds-core/issues/1977)) ([76cfa7e](https://github.com/defenseunicorns/uds-core/commit/76cfa7e47d9d5cc61b89d7472216b780cb8fe6e7))
* **deps:** update support-deps ([#1978](https://github.com/defenseunicorns/uds-core/issues/1978)) ([de3c014](https://github.com/defenseunicorns/uds-core/commit/de3c014e33c143cc71640791ceaf68cde34a700c))
* **deps:** update support-deps ([#2006](https://github.com/defenseunicorns/uds-core/issues/2006)) ([4a47e5b](https://github.com/defenseunicorns/uds-core/commit/4a47e5b4aa5db00b9ff299cb6be8c2ecc70a4531))
* **deps:** update uds-identity-config to v0.19.0 ([#2020](https://github.com/defenseunicorns/uds-core/issues/2020)) ([622509b](https://github.com/defenseunicorns/uds-core/commit/622509bfa0332dad261462a196416069f4589d4f))
* mappings ([#2005](https://github.com/defenseunicorns/uds-core/issues/2005)) ([f9c525a](https://github.com/defenseunicorns/uds-core/commit/f9c525a666d8456b3d8048b7d60f401f762517bc))

## [0.53.1](https://github.com/defenseunicorns/uds-core/compare/v0.53.0...v0.53.1) (2025-10-06)


### Bug Fixes

* handle legacy authservice client status ([#1992](https://github.com/defenseunicorns/uds-core/issues/1992)) ([f877047](https://github.com/defenseunicorns/uds-core/commit/f877047d764daa6cb2f9a3a4afa276def72d4e5d))


### Miscellaneous

* **deps:** update grafana to v12.2.0 ([#1943](https://github.com/defenseunicorns/uds-core/issues/1943)) ([f6d486e](https://github.com/defenseunicorns/uds-core/commit/f6d486e948ac6983965978549d4672f3081e6844))
* **deps:** update kube-webhook-certgen to 1.6.3 ([#1966](https://github.com/defenseunicorns/uds-core/issues/1966)) ([0962fe3](https://github.com/defenseunicorns/uds-core/commit/0962fe35ddac15be2e027452df831d8c2fbf37c0))
* **deps:** update pepr to v0.55.3 ([#1983](https://github.com/defenseunicorns/uds-core/issues/1983)) ([0cd873a](https://github.com/defenseunicorns/uds-core/commit/0cd873a2132c9e442150dcb92c376b9c325de6cd))
* **deps:** update vector to 0.50.0 ([#1942](https://github.com/defenseunicorns/uds-core/issues/1942)) ([8c6de9c](https://github.com/defenseunicorns/uds-core/commit/8c6de9c3f871350b850cd64f0ea27f9070d27784))
* **deps:** update velero to 1.17.0 ([#1869](https://github.com/defenseunicorns/uds-core/issues/1869)) ([4c6724b](https://github.com/defenseunicorns/uds-core/commit/4c6724b447549d40a87ecab045c74efa43cf3831))
* enable sandbox incubating falco rules for iac tests ([#1982](https://github.com/defenseunicorns/uds-core/issues/1982)) ([f144a10](https://github.com/defenseunicorns/uds-core/commit/f144a10515733852e213755e16e53221c81a04be))
* lula workflow ([#1985](https://github.com/defenseunicorns/uds-core/issues/1985)) ([2f7906d](https://github.com/defenseunicorns/uds-core/commit/2f7906dc4b468efcca796ae86a8f469e7744e32a))
* remove lula1/oscal compliance information ([#1984](https://github.com/defenseunicorns/uds-core/issues/1984)) ([8638b92](https://github.com/defenseunicorns/uds-core/commit/8638b92195470c5b3e7d83ed09da8ee26197f415))

## [0.53.0](https://github.com/defenseunicorns/uds-core/compare/v0.52.1...v0.53.0) (2025-09-30)


### ⚠ BREAKING CHANGES

* Loki Ruler is now configured to use local storage backend for rules files by default to support loading rules as ConfigMaps.  If you created Loki Ruler rules with the Loki API with an object storage backend, those rules will be disabled and will need to be applied as ConfigMaps.

### Features

* add falco as an optional zarf package for runtime-security ([#1903](https://github.com/defenseunicorns/uds-core/issues/1903)) ([5d5442f](https://github.com/defenseunicorns/uds-core/commit/5d5442f7f07355cc98668f4c31dcb7d200ba3248))
* add support for extra gateways in expose spec ([#1912](https://github.com/defenseunicorns/uds-core/issues/1912)) ([7380d0f](https://github.com/defenseunicorns/uds-core/commit/7380d0f175f7fb8c15b3be7cf8e3ea8f4d9e519b))
* block istio.io/redirect-virtual-interfaces annotation ([#1946](https://github.com/defenseunicorns/uds-core/issues/1946)) ([620143e](https://github.com/defenseunicorns/uds-core/commit/620143eef4c82103adaa403fcad338d20c235936))
* enable loki ruler alerting/recording ([#1930](https://github.com/defenseunicorns/uds-core/issues/1930)) ([0e2786e](https://github.com/defenseunicorns/uds-core/commit/0e2786e76172b64a742e7e2bdc75069e03e86010))
* falco extra rulesets ([#1944](https://github.com/defenseunicorns/uds-core/issues/1944)) ([49e9e15](https://github.com/defenseunicorns/uds-core/commit/49e9e15ec2805733aaf1b137c16c4b27de60fd59))
* keycloak sizing ([#1898](https://github.com/defenseunicorns/uds-core/issues/1898)) ([cfd4dc3](https://github.com/defenseunicorns/uds-core/commit/cfd4dc32504a32f2ee0544e7b19c5733b6920950))
* x509 Authentication Flow control ([#1925](https://github.com/defenseunicorns/uds-core/issues/1925)) ([55ed398](https://github.com/defenseunicorns/uds-core/commit/55ed3988344d9faa25d54b0c2ca07745fa9a3677))


### Bug Fixes

* add pull-requests write to lula workflow ([#1926](https://github.com/defenseunicorns/uds-core/issues/1926)) ([4d21925](https://github.com/defenseunicorns/uds-core/commit/4d219255d7284071175f6d3d6016c2defe3937e1))
* **ci:** ignore metrics on policy test pod ([#1938](https://github.com/defenseunicorns/uds-core/issues/1938)) ([f6a0c06](https://github.com/defenseunicorns/uds-core/commit/f6a0c06e86734c159916d8a5453c85cbbeafb0eb))
* **ci:** upgrade bug on release PR ([#1976](https://github.com/defenseunicorns/uds-core/issues/1976)) ([3422e41](https://github.com/defenseunicorns/uds-core/commit/3422e415fe692937c6373f4fe1b97f2cf0cbdbb1))
* dev task workflow ([#1931](https://github.com/defenseunicorns/uds-core/issues/1931)) ([84f0ec1](https://github.com/defenseunicorns/uds-core/commit/84f0ec1021da2334ce7c73b358656a0f3490459d))
* renovate readiness pepr labels ([#1920](https://github.com/defenseunicorns/uds-core/issues/1920)) ([4d13422](https://github.com/defenseunicorns/uds-core/commit/4d13422e5018d914876423e483c724aad0fbce03))
* replace neuvector in diagrams with falco ([#1964](https://github.com/defenseunicorns/uds-core/issues/1964)) ([c191b85](https://github.com/defenseunicorns/uds-core/commit/c191b8537ea1457a5431dbc8ebe9aefcb8571904))
* switch Keycloak to JDBC_PING ([#1937](https://github.com/defenseunicorns/uds-core/issues/1937)) ([bdf1e06](https://github.com/defenseunicorns/uds-core/commit/bdf1e0645cebf062e271277b67e02f60504751db))


### Miscellaneous

* add adr to switch runtime security from neuvector to falco ([#1965](https://github.com/defenseunicorns/uds-core/issues/1965)) ([207f79d](https://github.com/defenseunicorns/uds-core/commit/207f79dd3905a70e6df7b9fb0ad5067ed6678028))
* add lula uuid to core ([#1933](https://github.com/defenseunicorns/uds-core/issues/1933)) ([21b7156](https://github.com/defenseunicorns/uds-core/commit/21b7156fc40e2007a445090e874c11830e30feff))
* **ci:** update to k8s 1.33 ([#1948](https://github.com/defenseunicorns/uds-core/issues/1948)) ([3ab81b5](https://github.com/defenseunicorns/uds-core/commit/3ab81b5fdc7b42cae06472d4a08389a285727993))
* **deps-dev:** bump tar-fs from 3.0.9 to 3.1.1 in /test/vitest ([#1962](https://github.com/defenseunicorns/uds-core/issues/1962)) ([75357b7](https://github.com/defenseunicorns/uds-core/commit/75357b782d8ed4029e8944ce56e5d9693088dfa7))
* **deps:** bump tar-fs from 3.1.0 to 3.1.1 ([#1951](https://github.com/defenseunicorns/uds-core/issues/1951)) ([4e342d5](https://github.com/defenseunicorns/uds-core/commit/4e342d5f41bdd795a53fb5031e46789512db0c70))
* **deps:** update authservice to v1.1.0 ([#1811](https://github.com/defenseunicorns/uds-core/issues/1811)) ([43cbe66](https://github.com/defenseunicorns/uds-core/commit/43cbe66ae585f5f88c918c52656da81203af42b0))
* **deps:** update authservice to v1.1.1 ([#1956](https://github.com/defenseunicorns/uds-core/issues/1956)) ([a8bdc09](https://github.com/defenseunicorns/uds-core/commit/a8bdc09d709069583cb9170c8ba8eb79133d092f))
* **deps:** update commitlint to v20 ([#1954](https://github.com/defenseunicorns/uds-core/issues/1954)) ([29ff392](https://github.com/defenseunicorns/uds-core/commit/29ff392774156be9ebb11553caaa7e2956483e8a))
* **deps:** update falco to v2.32.0 ([#1968](https://github.com/defenseunicorns/uds-core/issues/1968)) ([5ee88ab](https://github.com/defenseunicorns/uds-core/commit/5ee88ab9ab8119c1f18de681480be80e79e36662))
* **deps:** update grafana chart to 10.0.0, curl to 8.16.0 ([#1901](https://github.com/defenseunicorns/uds-core/issues/1901)) ([d62468c](https://github.com/defenseunicorns/uds-core/commit/d62468cab3bc2d5899d2f35d0b5b6010ba25fe50))
* **deps:** update keycloak to 26.3.5, identity-config to 0.18.0 ([#1952](https://github.com/defenseunicorns/uds-core/issues/1952)) ([2c025b9](https://github.com/defenseunicorns/uds-core/commit/2c025b9b073a27f631db8997d6a70fb537dc576f))
* **deps:** update keycloak to v26.3.4 ([#1907](https://github.com/defenseunicorns/uds-core/issues/1907)) ([f951047](https://github.com/defenseunicorns/uds-core/commit/f95104794ee0ca5c79c2ef6173b3915cfbbb9291))
* **deps:** update kube-webhook-certgen to 1.6.2, kube-state-metrics to 2.17.0 ([#1902](https://github.com/defenseunicorns/uds-core/issues/1902)) ([6ee7051](https://github.com/defenseunicorns/uds-core/commit/6ee70512bb28dc9e2f01865cbaa145ff21ba432f))
* **deps:** update lint-staged, eslint ([#1934](https://github.com/defenseunicorns/uds-core/issues/1934)) ([1bf4156](https://github.com/defenseunicorns/uds-core/commit/1bf4156fa43f8eb6bd6d1b9f27b4ba9f15bc7e52))
* **deps:** update loki to 3.5.5 ([#1851](https://github.com/defenseunicorns/uds-core/issues/1851)) ([2ef1d5e](https://github.com/defenseunicorns/uds-core/commit/2ef1d5e29fc66988bcf67d707d448cffc22e6bb3))
* **deps:** update neuvector curl to v8.16.0 ([#1923](https://github.com/defenseunicorns/uds-core/issues/1923)) ([c2cb4b1](https://github.com/defenseunicorns/uds-core/commit/c2cb4b1fa95ddd4a7ad5fe07b285cf42a5fbc590))
* **deps:** update pepr to 0.55.0 ([#1894](https://github.com/defenseunicorns/uds-core/issues/1894)) ([4ec1bba](https://github.com/defenseunicorns/uds-core/commit/4ec1bba8f3faeb723856de1e16d20b415f5163d0))
* **deps:** update pepr to v0.55.1 ([#1958](https://github.com/defenseunicorns/uds-core/issues/1958)) ([b0247b6](https://github.com/defenseunicorns/uds-core/commit/b0247b6fb6b985656c65a265e8f1fa2dd114b078))
* **deps:** update prometheus to 3.6.0 ([#1936](https://github.com/defenseunicorns/uds-core/issues/1936)) ([1a0a709](https://github.com/defenseunicorns/uds-core/commit/1a0a709dcaf370e21cda0ac31250ec5d1cd414d6))
* **deps:** update support-deps ([#1927](https://github.com/defenseunicorns/uds-core/issues/1927)) ([373b265](https://github.com/defenseunicorns/uds-core/commit/373b265f5341bfb06973dc7b7795ba84fbb48e7f))
* **deps:** update support-deps ([#1935](https://github.com/defenseunicorns/uds-core/issues/1935)) ([abd224d](https://github.com/defenseunicorns/uds-core/commit/abd224db297202f90c1527a74e0423914bba4cdc))
* **deps:** update support-deps ([#1963](https://github.com/defenseunicorns/uds-core/issues/1963)) ([2841e1e](https://github.com/defenseunicorns/uds-core/commit/2841e1e691a47f7171bc9982311a561f7717ed22))
* disable noisy falco rules ([#1979](https://github.com/defenseunicorns/uds-core/issues/1979)) ([2d42432](https://github.com/defenseunicorns/uds-core/commit/2d4243217599a66a7872af5c327e14e67190609a))
* revert authservice 1.1.0, add slim-dev-ha task ([#1953](https://github.com/defenseunicorns/uds-core/issues/1953)) ([403c3d4](https://github.com/defenseunicorns/uds-core/commit/403c3d4a3090cba9c441dfdef87cc8c79477a036))
* revert support-deps ([#1975](https://github.com/defenseunicorns/uds-core/issues/1975)) ([eeb9fd9](https://github.com/defenseunicorns/uds-core/commit/eeb9fd9efc338a75f7164bd54313566a64040c2d))
* split pepr and operator-deps into own renovate groups ([#1959](https://github.com/defenseunicorns/uds-core/issues/1959)) ([6efb20d](https://github.com/defenseunicorns/uds-core/commit/6efb20db21fb3fc65cc2092ae181137241f2151c))
* update HA bundle configs to use 2 authservice replicas ([#1957](https://github.com/defenseunicorns/uds-core/issues/1957)) ([5532036](https://github.com/defenseunicorns/uds-core/commit/5532036c4a14712333b28d9382b5bcf7f0fe964c))
* update renovate config to ignore a bad tag in registry1 ([#1970](https://github.com/defenseunicorns/uds-core/issues/1970)) ([654c6e9](https://github.com/defenseunicorns/uds-core/commit/654c6e9645629e4b14ab076b587c749a391e9212))


### Documentation

* keycloak events logging ([#1945](https://github.com/defenseunicorns/uds-core/issues/1945)) ([407219e](https://github.com/defenseunicorns/uds-core/commit/407219e408176e7358712d5dbeda3aded39329b7))
* update keycloak kernel bug workaround bundle override ([#1928](https://github.com/defenseunicorns/uds-core/issues/1928)) ([a4537a8](https://github.com/defenseunicorns/uds-core/commit/a4537a82e48b69715791e333e9f2555a8cdd5a0a))

## [0.52.1](https://github.com/defenseunicorns/uds-core/compare/v0.52.0...v0.52.1) (2025-09-16)


### ⚠ BREAKING CHANGES

* Keycloak `podManagementPolicy` Helm Chart value has been removed as setting it to anything other than `OrderedReady` can cause clustering outages. During the upgrade procedure, if the previously used value was `Parallel`, Keycloak will temporarily scale in to 1 replica. Once the StatefulSet gets updated, it will scale out to previously set value.

### Bug Fixes

* bundle and package naming ([#1906](https://github.com/defenseunicorns/uds-core/issues/1906)) ([2f83774](https://github.com/defenseunicorns/uds-core/commit/2f8377454cc324d901f834a8964add6bc656d5c4))
* improve Keycloak stability (https://github.com/defenseunicorns/uds-core/pull/1917) ([6422900](https://github.com/defenseunicorns/uds-core/commit/6422900b1d5d059b019b8f452e7b7594cfec31db))
* pepr policy unit testing ([#1880](https://github.com/defenseunicorns/uds-core/issues/1880)) ([b367419](https://github.com/defenseunicorns/uds-core/commit/b367419f17ee2c8283a171424fde7b58b2751a35))
* revert 0.52.1 and adjust CI publish workflow ([#1921](https://github.com/defenseunicorns/uds-core/issues/1921)) ([5e6dd36](https://github.com/defenseunicorns/uds-core/commit/5e6dd3650dd2fdd48e3f93dcbebdb097055756aa))


### Miscellaneous

* **deps-dev:** bump vite from 6.3.5 to 7.1.5 in /scripts/renovate ([#1904](https://github.com/defenseunicorns/uds-core/issues/1904)) ([df5c418](https://github.com/defenseunicorns/uds-core/commit/df5c41812099b7664e8c074661309f64c911e67f))
* **deps:** update prometheus-stack ([#1829](https://github.com/defenseunicorns/uds-core/issues/1829)) ([b78d1e8](https://github.com/defenseunicorns/uds-core/commit/b78d1e8147c24262e78c4618b04286e15e3b32a1))
* **deps:** update support-deps ([#1876](https://github.com/defenseunicorns/uds-core/issues/1876)) ([f36f1bc](https://github.com/defenseunicorns/uds-core/commit/f36f1bc1221bb88ba916019d50d3157b63a36bba))
* fix logging breaking change in pino 9.9.x ([#1885](https://github.com/defenseunicorns/uds-core/issues/1885)) ([73a5920](https://github.com/defenseunicorns/uds-core/commit/73a59204813efcdca4ed5585543da246a014df7a))
* lula2 crawl to prs ([#1918](https://github.com/defenseunicorns/uds-core/issues/1918)) ([3d667b0](https://github.com/defenseunicorns/uds-core/commit/3d667b017923804c7b0948312a9f8586ed5730f6))


### Documentation

* add doc on trusting private pki ([#1881](https://github.com/defenseunicorns/uds-core/issues/1881)) ([4a4d366](https://github.com/defenseunicorns/uds-core/commit/4a4d3667c5af84d78e68a4ea2bee358ac9ee694c))

## [0.52.0](https://github.com/defenseunicorns/uds-core/compare/v0.51.0...v0.52.0) (2025-09-10)


### Features

* add helm values for extra volumes and truststorepaths to keycloak ([#1882](https://github.com/defenseunicorns/uds-core/issues/1882)) ([47c444b](https://github.com/defenseunicorns/uds-core/commit/47c444be0440c8c9a6d3cbe046e4a82161fce26c))


### Bug Fixes

* avoid port conflicts on the host ([#1870](https://github.com/defenseunicorns/uds-core/issues/1870)) ([09a1364](https://github.com/defenseunicorns/uds-core/commit/09a1364ab26270ea9ee621aff178b92bad2004cb))
* waypoint configuration for keycloak and neuvector ([#1896](https://github.com/defenseunicorns/uds-core/issues/1896)) ([51b08db](https://github.com/defenseunicorns/uds-core/commit/51b08db4c44b88c924f7295d4628744042e394e7))


### Miscellaneous

* **deps-dev:** bump vite from 6.3.5 to 7.1.5 in /test/vitest ([#1895](https://github.com/defenseunicorns/uds-core/issues/1895)) ([2028a45](https://github.com/defenseunicorns/uds-core/commit/2028a45fcf3e661988244ed31d89583f9f11f165))
* **deps:** bump vite from 7.0.6 to 7.1.5 ([#1892](https://github.com/defenseunicorns/uds-core/issues/1892)) ([042f19c](https://github.com/defenseunicorns/uds-core/commit/042f19c23eb192b8ab90472eafa79d92f056813f))
* **deps:** update eslint/js to v9.35.0 ([#1888](https://github.com/defenseunicorns/uds-core/issues/1888)) ([6c056ae](https://github.com/defenseunicorns/uds-core/commit/6c056aef86366206529e651348fcd6ec579996db))
* **deps:** update neuvector to 5.4.6 ([#1859](https://github.com/defenseunicorns/uds-core/issues/1859)) ([54c58c7](https://github.com/defenseunicorns/uds-core/commit/54c58c7bbefee68d7ca17e69e82f31bf7021a218))
* **deps:** update pepr to v0.54.0 ([#1879](https://github.com/defenseunicorns/uds-core/issues/1879)) ([f1463e7](https://github.com/defenseunicorns/uds-core/commit/f1463e7e067482b69651da6d53d5aba1864a9fa1))
* remove upgrade mutations for prometheus monitors ([#1877](https://github.com/defenseunicorns/uds-core/issues/1877)) ([bbeadc7](https://github.com/defenseunicorns/uds-core/commit/bbeadc7efd20db8f79c2166ac60ee7203364739f))


### Documentation

* fix some broken links on authservice ([#1890](https://github.com/defenseunicorns/uds-core/issues/1890)) ([07d7621](https://github.com/defenseunicorns/uds-core/commit/07d76218996ac454aecb640da9274728607c429d))

## [0.51.0](https://github.com/defenseunicorns/uds-core/compare/v0.50.0...v0.51.0) (2025-09-02)


### Features

* ambient egress ([#1697](https://github.com/defenseunicorns/uds-core/issues/1697)) ([4f276d4](https://github.com/defenseunicorns/uds-core/commit/4f276d4fe71e3256e70add5a1c73d9cfd7e92679))
* limit the number of concurrent sessions ([#1838](https://github.com/defenseunicorns/uds-core/issues/1838)) ([7786482](https://github.com/defenseunicorns/uds-core/commit/77864822b50c0ea96dc25908e0a219cf4d1e084f))


### Bug Fixes

* broken link to session timeout ([#1850](https://github.com/defenseunicorns/uds-core/issues/1850)) ([589f90d](https://github.com/defenseunicorns/uds-core/commit/589f90d3982911ebc60c3f3bd98c4b250aaeca86))
* clean up testing methodologies ([#1863](https://github.com/defenseunicorns/uds-core/issues/1863)) ([43d2715](https://github.com/defenseunicorns/uds-core/commit/43d271532972e2fe571fdd271fdc378d635d6af3))
* sync watch config with upstream default ([#1846](https://github.com/defenseunicorns/uds-core/issues/1846)) ([c147398](https://github.com/defenseunicorns/uds-core/commit/c147398aa7cc4ee16bdb5ee8d56e42741f40e88e))


### Miscellaneous

* **deps:** update eslint-js to v9.34.0 ([#1856](https://github.com/defenseunicorns/uds-core/issues/1856)) ([6776df9](https://github.com/defenseunicorns/uds-core/commit/6776df9a449702141a3bea77c170b6dbcc1b1917))
* **deps:** update grafana to 12.1.1 ([#1787](https://github.com/defenseunicorns/uds-core/issues/1787)) ([2390b7f](https://github.com/defenseunicorns/uds-core/commit/2390b7f9e3d404d03a1ef9349d8c89146af36c7a))
* **deps:** update k8s-sidecar to 1.30.10 ([#1860](https://github.com/defenseunicorns/uds-core/issues/1860)) ([17cc5ac](https://github.com/defenseunicorns/uds-core/commit/17cc5ac1691d6072c93248f50f66012b2cfb4535))
* **deps:** update keycloak to v26.3.3 ([#1844](https://github.com/defenseunicorns/uds-core/issues/1844)) ([d95b806](https://github.com/defenseunicorns/uds-core/commit/d95b806a26f754886d2ae6559f5cb2077b692374))
* **deps:** update lint-staged to v16.1.6 ([#1868](https://github.com/defenseunicorns/uds-core/issues/1868)) ([0ba286f](https://github.com/defenseunicorns/uds-core/commit/0ba286f982cbf5243ba0373626c28ae89c8d90c2))
* **deps:** update pepr to v0.53.0 ([#1842](https://github.com/defenseunicorns/uds-core/issues/1842)) ([f10a746](https://github.com/defenseunicorns/uds-core/commit/f10a746a28edba3c53a8b8abf37716864574c698))
* **deps:** update pepr to v0.53.1 ([#1848](https://github.com/defenseunicorns/uds-core/issues/1848)) ([4530fa1](https://github.com/defenseunicorns/uds-core/commit/4530fa14da9432340892b2a92d3b9ebdae9e418d))
* **deps:** update support-deps ([#1832](https://github.com/defenseunicorns/uds-core/issues/1832)) ([d1bd1ba](https://github.com/defenseunicorns/uds-core/commit/d1bd1ba7645c55de5c771cf45cb980b634df26da))
* **deps:** update velero kubectl to 1.34.0 ([#1866](https://github.com/defenseunicorns/uds-core/issues/1866)) ([fe39079](https://github.com/defenseunicorns/uds-core/commit/fe39079204337a1c5e9973caec42024d8c9a2554))
* switch to bitnamilegacy, cleanup keycloak sources ([#1862](https://github.com/defenseunicorns/uds-core/issues/1862)) ([8686ceb](https://github.com/defenseunicorns/uds-core/commit/8686ceb69306e049c20cd50fe422132f7c42a1ff))
* update istio / pepr policy behavior ([#1857](https://github.com/defenseunicorns/uds-core/issues/1857)) ([4ee68f1](https://github.com/defenseunicorns/uds-core/commit/4ee68f1120f5f6edea4763d8b9634de103c19356))


### Documentation

* add clarity on certificate chain ([#1853](https://github.com/defenseunicorns/uds-core/issues/1853)) ([7da9cf6](https://github.com/defenseunicorns/uds-core/commit/7da9cf634add3c369b51e4c2bfe0c80c72c07e9c))
* add release overview doc, versioning policy ([#1843](https://github.com/defenseunicorns/uds-core/issues/1843)) ([d639065](https://github.com/defenseunicorns/uds-core/commit/d639065368f535c1d06796baf78711d2d7bf0c42))
* diagram updates for ambient mode, maintainability ([#1852](https://github.com/defenseunicorns/uds-core/issues/1852)) ([0c1a1d6](https://github.com/defenseunicorns/uds-core/commit/0c1a1d6c5e7341a7761fa92f24d1d05e0d99d728))
* update contributing.md format/content ([#1858](https://github.com/defenseunicorns/uds-core/issues/1858)) ([e90e6de](https://github.com/defenseunicorns/uds-core/commit/e90e6de64632eda7e151c85d95b2b58d8008a455))
* update diagrams to reflect ambient ([#1855](https://github.com/defenseunicorns/uds-core/issues/1855)) ([0c79401](https://github.com/defenseunicorns/uds-core/commit/0c79401ab881a3dc953b9e3a9c2c04ca0234f583))

## [0.50.0](https://github.com/defenseunicorns/uds-core/compare/v0.49.0...v0.50.0) (2025-08-19)


### ⚠ BREAKING CHANGES

* Pod annotations/labels that can modify secure Istio behavior are now blocked by policy. If you currently use these annotations/labels, you must remove them or add a [UDS Exemption](https://uds.defenseunicorns.com/reference/configuration/uds-operator/exemption/) prior to upgrading. See the policies `RestrictIstioSidecarOverrides`, `RestrictIstioTrafficOverrides`, `RestrictIstioAmbientOverrides` in the table [here](https://uds.defenseunicorns.com/reference/configuration/pepr-policies/#pepr-policy-validations) for the full list of annotations/labels blocked.

### Features

* enforce block on dangerous istio annotations/labels ([#1819](https://github.com/defenseunicorns/uds-core/issues/1819)) ([59fbc4f](https://github.com/defenseunicorns/uds-core/commit/59fbc4fa2355f52080cc2391917b3ae5d2aa10f2))


### Bug Fixes

* renovate readiness changes list ([#1833](https://github.com/defenseunicorns/uds-core/issues/1833)) ([350cab4](https://github.com/defenseunicorns/uds-core/commit/350cab44e6719512e00d35c6087bb3ffedc2c78c))
* servicemonitor mutation logic cleanup ([#1805](https://github.com/defenseunicorns/uds-core/issues/1805)) ([3efb97c](https://github.com/defenseunicorns/uds-core/commit/3efb97cc1c03792e1c17044806bc2d853faa2129))


### Miscellaneous

* **deps:** update keycloak to v0.16.3 ([#1841](https://github.com/defenseunicorns/uds-core/issues/1841)) ([0b881fc](https://github.com/defenseunicorns/uds-core/commit/0b881fcbc8c576d7f4653e61c6a231d62130d057))
* **deps:** update loki unicorn nginx to 1.29.1 ([#1802](https://github.com/defenseunicorns/uds-core/issues/1802)) ([d7c71dc](https://github.com/defenseunicorns/uds-core/commit/d7c71dc36894defbce9dcd3b7b2f9c8858a58595))
* **deps:** update prometheus-stack ([#1767](https://github.com/defenseunicorns/uds-core/issues/1767)) ([70de491](https://github.com/defenseunicorns/uds-core/commit/70de49165718876bd1567ea12edb2c073533d1b4))
* **deps:** update vector ([#1812](https://github.com/defenseunicorns/uds-core/issues/1812)) ([0ce9d6b](https://github.com/defenseunicorns/uds-core/commit/0ce9d6b72678e2dcb0103fdf77d2a276d46fb573))
* **deps:** update velero ([#1815](https://github.com/defenseunicorns/uds-core/issues/1815)) ([bf48941](https://github.com/defenseunicorns/uds-core/commit/bf489411aa56e1a300cd5ffc8dda0f7d1b7aedb8))
* exclude istio-system from policy checks ([#1816](https://github.com/defenseunicorns/uds-core/issues/1816)) ([978fbe2](https://github.com/defenseunicorns/uds-core/commit/978fbe2ac0cb8dd57db47cd0ffb4299ad48fd071))
* re-add ha testing, simplify cfg loading code ([#1825](https://github.com/defenseunicorns/uds-core/issues/1825)) ([57cab48](https://github.com/defenseunicorns/uds-core/commit/57cab48d0e7fe4be1189b29dcfaf82962d7e7f66))
* renovate readiness log output ([#1831](https://github.com/defenseunicorns/uds-core/issues/1831)) ([1faae26](https://github.com/defenseunicorns/uds-core/commit/1faae26ebc20014e072950b98edd2f4b575b34ed))


### Documentation

* note on webhook troubleshooting ([#1830](https://github.com/defenseunicorns/uds-core/issues/1830)) ([eacd754](https://github.com/defenseunicorns/uds-core/commit/eacd7540ee14a17f085d59bcb6113b6ef4644a4e))
* readme localhost note ([#1826](https://github.com/defenseunicorns/uds-core/issues/1826)) ([f9ce909](https://github.com/defenseunicorns/uds-core/commit/f9ce9092607858882eb9773b66a3b54104be2181))
* update distribution support, add pipeline badges ([#1834](https://github.com/defenseunicorns/uds-core/issues/1834)) ([c263f12](https://github.com/defenseunicorns/uds-core/commit/c263f128b55e2001f017c9f97da7c6d4ab4e4585))

## [0.49.0](https://github.com/defenseunicorns/uds-core/compare/v0.48.1...v0.49.0) (2025-08-14)


### ⚠ BREAKING CHANGES

* Grafana and NeuVector now have [group auth protection](https://uds.defenseunicorns.com/reference/configuration/single-sign-on/group-based-auth/) provided by Keycloak. If you have been allowing different groups access to these applications (beyond the default Admin/Auditor groups), you will need to provide additional overrides to ensure Keycloak allows these groups to access the applications (see [docs](https://uds.defenseunicorns.com/reference/configuration/single-sign-on/overview/#applications)).

### Features

* add sso group auth grafana/neuvector ([#1809](https://github.com/defenseunicorns/uds-core/issues/1809)) ([1e7a402](https://github.com/defenseunicorns/uds-core/commit/1e7a40284aefb5d635c2219fe45b69ebdbda74c1))


### Bug Fixes

* add missing gateway crd and fix dev workflow ([#1807](https://github.com/defenseunicorns/uds-core/issues/1807)) ([615a958](https://github.com/defenseunicorns/uds-core/commit/615a95869c07e5868cb8d76d0830101b0885b441))
* authservice config processing ([#1824](https://github.com/defenseunicorns/uds-core/issues/1824)) ([d10102c](https://github.com/defenseunicorns/uds-core/commit/d10102c9aa24d43829176b8fa4c6479ccc45839f))
* renovate comments on unicorn istio values ([#1818](https://github.com/defenseunicorns/uds-core/issues/1818)) ([c1cb5b6](https://github.com/defenseunicorns/uds-core/commit/c1cb5b6e202a1d706324b62403b81d5893e3c614))
* revert the naming of network policies to pre authservice ambient pr ([#1813](https://github.com/defenseunicorns/uds-core/issues/1813)) ([65afe98](https://github.com/defenseunicorns/uds-core/commit/65afe9862ab291973f18629ef51d1cef061bd306))
* scorecard slack alerts ([#1822](https://github.com/defenseunicorns/uds-core/issues/1822)) ([97b1343](https://github.com/defenseunicorns/uds-core/commit/97b1343fd994ea0ea571f49dc8472c00d73b9024))


### Miscellaneous

* **ci:** slack pipeline alerting for nightly tests ([#1804](https://github.com/defenseunicorns/uds-core/issues/1804)) ([03ecda7](https://github.com/defenseunicorns/uds-core/commit/03ecda794cd8a1c5c55a062a322a80abaea1af6f))
* **deps:** update neuvector curl image to v8.15.0 ([#1817](https://github.com/defenseunicorns/uds-core/issues/1817)) ([80052ca](https://github.com/defenseunicorns/uds-core/commit/80052ca4d527611a2114a8f5c129ce1d4db17365))
* **deps:** update velero ([#1775](https://github.com/defenseunicorns/uds-core/issues/1775)) ([65160ef](https://github.com/defenseunicorns/uds-core/commit/65160eff8e2e90ab0323be0a67f5d441872631e9))

## [0.48.1](https://github.com/defenseunicorns/uds-core/compare/v0.48.0...v0.48.1) (2025-08-11)


### Bug Fixes

* netpol naming ([#1808](https://github.com/defenseunicorns/uds-core/issues/1808)) ([0352839](https://github.com/defenseunicorns/uds-core/commit/0352839877689111faac3c5ef84ca97d482d7c4e))


### Miscellaneous

* **deps:** update pepr ([#1803](https://github.com/defenseunicorns/uds-core/issues/1803)) ([5d21c1d](https://github.com/defenseunicorns/uds-core/commit/5d21c1d67db1198fa942cf56f3c3e2e19cf255ea))
* **deps:** update pepr to v9.33.0 ([#1806](https://github.com/defenseunicorns/uds-core/issues/1806)) ([23d2c8f](https://github.com/defenseunicorns/uds-core/commit/23d2c8f890007c4981149bcfcebef261360fbc8d))


### Documentation

* update pepr-policies doc to include full list of istio annotations ([#1799](https://github.com/defenseunicorns/uds-core/issues/1799)) ([5c8d9e5](https://github.com/defenseunicorns/uds-core/commit/5c8d9e55f6eee2a49127909430aa791499950e33))

## [0.48.0](https://github.com/defenseunicorns/uds-core/compare/v0.47.0...v0.48.0) (2025-08-05)


### ⚠ BREAKING CHANGES

* The following bundle overrides are no longer valid, and you will need to use the corresponding `cluster` values instead, or where applicable use the Zarf variable. If currently using the Zarf variables to set these configs there is no change. If using helm/bundle overrides, review the table below: <br><table><thead><tr><th>Removed Value</th><th>Replacement</th></tr></thead><tbody><tr><td><code>operator.UDS_DOMAIN</code></td><td><code>cluster.expose.domain</code> or Zarf variable <code>DOMAIN</code></td></tr><tr><td><code>operator.UDS_ADMIN_DOMAIN</code></td><td><code>cluster.expose.adminDomain</code> or Zarf variable <code>ADMIN_DOMAIN</code></td></tr><tr><td><code>operator.UDS_CA_CERT</code></td><td><code>cluster.expose.caCert</code> or Zarf variable <code>CA_CERT</code></td></tr><tr><td><code>operator.UDS_ALLOW_ALL_NS_EXEMPTIONS</code></td><td><code>cluster.policy.allowAllNsExemptions</code> or Zarf variable <code>ALLOW_ALL_NS_EXEMPTIONS</code></td></tr><tr><td><code>operator.UDS_LOG_LEVEL</code></td><td>Zarf variable <code>UDS_LOG_LEVEL</code> <em>(no bundle/Helm override available)</em></td></tr></tbody></table>

### Features

* add keycloak support for using pre-existing secrets ([#1731](https://github.com/defenseunicorns/uds-core/issues/1731)) ([8835e25](https://github.com/defenseunicorns/uds-core/commit/8835e25a0037ff79aafe2890894a6ce725f02314))
* add policies to warn usage of insecure istio annotation/label overrides ([#1753](https://github.com/defenseunicorns/uds-core/issues/1753)) ([f8e3c96](https://github.com/defenseunicorns/uds-core/commit/f8e3c96bc44a4493cdd9f890b1cb8cfe3f579ea6))
* create ClusterConfig CRD ([#1233](https://github.com/defenseunicorns/uds-core/issues/1233)) ([6547cad](https://github.com/defenseunicorns/uds-core/commit/6547cad1efd71cddaacbc0ad7da3334c7a71f72a))
* implement ambient authservice applications ([#1716](https://github.com/defenseunicorns/uds-core/issues/1716)) ([a4eafbb](https://github.com/defenseunicorns/uds-core/commit/a4eafbb62dec7d4c262eed1671d6fc592ae560ae))
* introduce new keycloak grafana dashboards ([#1778](https://github.com/defenseunicorns/uds-core/issues/1778)) ([e6afbb8](https://github.com/defenseunicorns/uds-core/commit/e6afbb870fb2ffa3fa42e6f480544441d90af4ce))
* support root domain in package cr ([#1756](https://github.com/defenseunicorns/uds-core/issues/1756)) ([8e12a76](https://github.com/defenseunicorns/uds-core/commit/8e12a76dcb36f0f48623667fe4b8c2a6e6d4c0cc))


### Bug Fixes

* add new ambient hosts to setup-hosts task ([#1779](https://github.com/defenseunicorns/uds-core/issues/1779)) ([6c0e945](https://github.com/defenseunicorns/uds-core/commit/6c0e94530125ebfe7ebecf2a2645ec1c1be2d261))
* **ci:** snapshot release creation fix ([#1786](https://github.com/defenseunicorns/uds-core/issues/1786)) ([e6aa756](https://github.com/defenseunicorns/uds-core/commit/e6aa756a676142e9aaafc6297323bafd0e013365))
* cleanup kubenodes target policies if node ip changes ([#1774](https://github.com/defenseunicorns/uds-core/issues/1774)) ([e5bc3e4](https://github.com/defenseunicorns/uds-core/commit/e5bc3e4bb9fcd5c27cd3b222f9f18b6fac19d49d))
* security scanning warnings ([#1764](https://github.com/defenseunicorns/uds-core/issues/1764)) ([48edfa0](https://github.com/defenseunicorns/uds-core/commit/48edfa090ce0a472ec592b8aee5a9e96ab49fddd))
* unicorn keycloak fips image ([#1771](https://github.com/defenseunicorns/uds-core/issues/1771)) ([ca7dbf7](https://github.com/defenseunicorns/uds-core/commit/ca7dbf73bef715ef31f68eccb584da60846066e1))
* upgrade tests uds-dev-stack ignore ([#1750](https://github.com/defenseunicorns/uds-core/issues/1750)) ([a0fd207](https://github.com/defenseunicorns/uds-core/commit/a0fd20726b2944f9fb681bffc62891217c72addd))


### Miscellaneous

* add openssf best practices badge ([#1762](https://github.com/defenseunicorns/uds-core/issues/1762)) ([0ba7012](https://github.com/defenseunicorns/uds-core/commit/0ba7012490fe7294e83b6bc41ed2eb51dc733f23))
* **deps-dev:** bump form-data from 4.0.3 to 4.0.4 in /test/vitest ([#1761](https://github.com/defenseunicorns/uds-core/issues/1761)) ([ea5d304](https://github.com/defenseunicorns/uds-core/commit/ea5d3049e3b3fc41dd54246791893d3ab37fd869))
* **deps:** bump @eslint/plugin-kit from 0.3.2 to 0.3.3 ([#1741](https://github.com/defenseunicorns/uds-core/issues/1741)) ([37713a4](https://github.com/defenseunicorns/uds-core/commit/37713a4e1cefb7b0a398e53c9e6c54d4b209a295))
* **deps:** bump form-data from 4.0.3 to 4.0.4 ([#1749](https://github.com/defenseunicorns/uds-core/issues/1749)) ([ea8ca0e](https://github.com/defenseunicorns/uds-core/commit/ea8ca0eec24c72b0b42eca3c03a3a66c70824ca3))
* **deps:** update eslint to v9.32.0 ([#1760](https://github.com/defenseunicorns/uds-core/issues/1760)) ([f0a64ea](https://github.com/defenseunicorns/uds-core/commit/f0a64ea386c30d13d85d1644e31893541409b500))
* **deps:** update grafana ([#1739](https://github.com/defenseunicorns/uds-core/issues/1739)) ([dc6f725](https://github.com/defenseunicorns/uds-core/commit/dc6f7256c6a1219d401ba58abcca655331efb7cd))
* **deps:** update keycloak to v0.16.2 ([#1781](https://github.com/defenseunicorns/uds-core/issues/1781)) ([fac80da](https://github.com/defenseunicorns/uds-core/commit/fac80dad628db3cdbe68ba334699f723ff5df840))
* **deps:** update keycloak to v26.3.2 ([#1757](https://github.com/defenseunicorns/uds-core/issues/1757)) ([a0ed09e](https://github.com/defenseunicorns/uds-core/commit/a0ed09ea603e4e92c0b85e4a5b73f5f559cc3dde))
* **deps:** update loki ([#1772](https://github.com/defenseunicorns/uds-core/issues/1772)) ([27e482f](https://github.com/defenseunicorns/uds-core/commit/27e482fc8236d57e727a5e19d16522e3ae4b481a))
* **deps:** update loki to 3.5.3 ([#1714](https://github.com/defenseunicorns/uds-core/issues/1714)) ([b1ba617](https://github.com/defenseunicorns/uds-core/commit/b1ba617e6b9d6e55594452b5d098b10bba715eaa))
* **deps:** update metrics-server to 0.8.0 ([#1694](https://github.com/defenseunicorns/uds-core/issues/1694)) ([41175f7](https://github.com/defenseunicorns/uds-core/commit/41175f7999fba23c9b854e4b5707e1a50d7577d4))
* **deps:** update neuvector to 5.4.5 ([#1717](https://github.com/defenseunicorns/uds-core/issues/1717)) ([81505b1](https://github.com/defenseunicorns/uds-core/commit/81505b189d7b12ae8318fa1f82b97bdbcec28607))
* **deps:** update pepr to v0.52.1 ([#1751](https://github.com/defenseunicorns/uds-core/issues/1751)) ([6d9d8ac](https://github.com/defenseunicorns/uds-core/commit/6d9d8ac0435d6b0a54018bd60f27051810407ee4))
* **deps:** update pepr to v0.52.2 ([#1763](https://github.com/defenseunicorns/uds-core/issues/1763)) ([ed2c13c](https://github.com/defenseunicorns/uds-core/commit/ed2c13c4d5c70bd95ad7e9c8762e0720e0c033a8))
* **deps:** update pepr to v16.1.4 ([#1785](https://github.com/defenseunicorns/uds-core/issues/1785)) ([be8b3e3](https://github.com/defenseunicorns/uds-core/commit/be8b3e3bbca22bea56e0e9197f10c48216eb2a21))
* **deps:** update prometheus to 3.5.0, operator to 0.84.0 ([#1663](https://github.com/defenseunicorns/uds-core/issues/1663)) ([4988788](https://github.com/defenseunicorns/uds-core/commit/49887889315ac3cf6c017b39acf32e3bf2b938c0))
* **deps:** update support dependencies to v2.8.1 ([#1796](https://github.com/defenseunicorns/uds-core/issues/1796)) ([d98b110](https://github.com/defenseunicorns/uds-core/commit/d98b110c6f4f4db748870e1d4bc67823cb6224bf))
* **deps:** update support dependencies to v21 ([#1776](https://github.com/defenseunicorns/uds-core/issues/1776)) ([840e760](https://github.com/defenseunicorns/uds-core/commit/840e7601cd81def4df5ebe854cb4479030c0e1d0))
* **deps:** update support dependencies to v5.3.0 ([#1794](https://github.com/defenseunicorns/uds-core/issues/1794)) ([92b0a92](https://github.com/defenseunicorns/uds-core/commit/92b0a92a745a950649e39e22e12f259c2058c233))
* **deps:** update support-deps ([#1768](https://github.com/defenseunicorns/uds-core/issues/1768)) ([221734a](https://github.com/defenseunicorns/uds-core/commit/221734a3469f39745e8719d98888347bffcbfe5c))
* **deps:** update support-deps ([#1793](https://github.com/defenseunicorns/uds-core/issues/1793)) ([0a6773e](https://github.com/defenseunicorns/uds-core/commit/0a6773ee2a652cf1c02d043ae268a4ba38953050))
* **docs:** fix broken link to app-authservice-tenant.yaml example ([#1789](https://github.com/defenseunicorns/uds-core/issues/1789)) ([8d44a6a](https://github.com/defenseunicorns/uds-core/commit/8d44a6a58bf9c5e49574833279c2d009c1c25b2d))
* **docs:** fix broken link to pepr enqueue and reconciler ([#1790](https://github.com/defenseunicorns/uds-core/issues/1790)) ([5e2d44a](https://github.com/defenseunicorns/uds-core/commit/5e2d44aa735b7a6ad67a44bb3c33cdf9beb4387d))
* **docs:** fix cluster config reference ([#1780](https://github.com/defenseunicorns/uds-core/issues/1780)) ([684c290](https://github.com/defenseunicorns/uds-core/commit/684c290b9c0d0896de65edbe2cf07d3c67d9869f))
* improved istio container detection in policies ([#1777](https://github.com/defenseunicorns/uds-core/issues/1777)) ([3e18944](https://github.com/defenseunicorns/uds-core/commit/3e18944e7020175e93b20c9ea0ce536a885747e4))
* revert security context change on neuvector ([#1765](https://github.com/defenseunicorns/uds-core/issues/1765)) ([823a8ae](https://github.com/defenseunicorns/uds-core/commit/823a8aea8db86bbf4f61c12dbca1511ee41519e7))
* switch single-layer tests to use airgapped k3d ([#1755](https://github.com/defenseunicorns/uds-core/issues/1755)) ([08334ed](https://github.com/defenseunicorns/uds-core/commit/08334eda27d31995e75ec040d27e8ee13e71b164))


### Documentation

* add RKE2 metrics config notes for control plane and CoreDNS ([#1759](https://github.com/defenseunicorns/uds-core/issues/1759)) ([eaaead4](https://github.com/defenseunicorns/uds-core/commit/eaaead4d8d5f8c97ea54f4cfcc1d66d6f9695a90))
* add upgrade documentation ([#1784](https://github.com/defenseunicorns/uds-core/issues/1784)) ([576c89f](https://github.com/defenseunicorns/uds-core/commit/576c89f52a1cbdc257055e75c9a9348524868142))
* fix broken link to authservice redis ([#1792](https://github.com/defenseunicorns/uds-core/issues/1792)) ([89fed8e](https://github.com/defenseunicorns/uds-core/commit/89fed8e7e99e545edc0eff2b77b6ad5fa92f4f5b))
* update readme for accuracy ([#1758](https://github.com/defenseunicorns/uds-core/issues/1758)) ([e1b7daa](https://github.com/defenseunicorns/uds-core/commit/e1b7daa1058c6706191304993eb7ea3297631224))

## [0.47.0](https://github.com/defenseunicorns/uds-core/compare/v0.46.0...v0.47.0) (2025-07-22)


### ⚠ BREAKING CHANGES

* add policy restricting usage of istio user/group 1337 ([#1730](https://github.com/defenseunicorns/uds-core/issues/1730))
* The `uds-dev-stack` namespace is no longer ignored by default for policies and operator reconciliation. If you wish to ignore this namespace or another namespace, you can continue to ignore namespaces by setting the `additionalIgnoredNamespaces` list in the `pepr-uds-core` component, `module` chart (via a bundle override). The dev and demo bundles will continue to ignore `uds-dev-stack`.

### Features

* add policy restricting usage of istio user/group 1337 ([#1730](https://github.com/defenseunicorns/uds-core/issues/1730)) ([8d338c7](https://github.com/defenseunicorns/uds-core/commit/8d338c7b165fbbc12f6f9bd79f31927660341a77))
* add secret pod reload ([#1713](https://github.com/defenseunicorns/uds-core/issues/1713)) ([8585a6f](https://github.com/defenseunicorns/uds-core/commit/8585a6fb6bfa6b820eddc417028bbdb3c9fbd832))
* aws alb support ([#1670](https://github.com/defenseunicorns/uds-core/issues/1670)) ([cdd407d](https://github.com/defenseunicorns/uds-core/commit/cdd407d4b82596771e21e74df471cae3a6460bef))


### Bug Fixes

* dev-setup with uds-dev-stack exemption ([#1736](https://github.com/defenseunicorns/uds-core/issues/1736)) ([299cb49](https://github.com/defenseunicorns/uds-core/commit/299cb49587741a3e2c7e4e2ff15b0a7613ca5f7e))
* keycloak revert rf image ([#1746](https://github.com/defenseunicorns/uds-core/issues/1746)) ([04265d3](https://github.com/defenseunicorns/uds-core/commit/04265d3eed6fcfed2d8f486b37bb24b64252165d))


### Miscellaneous

* **deps:** update k8s-sidecar to 1.30.7 ([#1715](https://github.com/defenseunicorns/uds-core/issues/1715)) ([5e37fe7](https://github.com/defenseunicorns/uds-core/commit/5e37fe7d4fc6f9e35f75a846a4e59ec360f89d5a))
* **deps:** update keycloak to v26.3.1 ([#1690](https://github.com/defenseunicorns/uds-core/issues/1690)) ([920320a](https://github.com/defenseunicorns/uds-core/commit/920320aa9fdbebb641bb1688f6c414186bc82019))
* **deps:** update pepr to v0.51.6 ([#1701](https://github.com/defenseunicorns/uds-core/issues/1701)) ([f523c31](https://github.com/defenseunicorns/uds-core/commit/f523c3157115923619cc999174a706369c0c0f6f))
* **deps:** update pepr to v9.31.0 ([#1729](https://github.com/defenseunicorns/uds-core/issues/1729)) ([77f36a0](https://github.com/defenseunicorns/uds-core/commit/77f36a0d3f325555b05a97156faaac1a8aa324b7))
* **deps:** update support-deps ([#1712](https://github.com/defenseunicorns/uds-core/issues/1712)) ([97b5d43](https://github.com/defenseunicorns/uds-core/commit/97b5d4371d55d2a6926d8aa08e4c1be9cdada8e3))
* **deps:** update velero kubectl image to 1.33.3 ([#1588](https://github.com/defenseunicorns/uds-core/issues/1588)) ([0eedce1](https://github.com/defenseunicorns/uds-core/commit/0eedce13e1e1877f9c99aac80ecf745b0039364b))
* **docs:** update contributing guide ([#1743](https://github.com/defenseunicorns/uds-core/issues/1743)) ([25da98c](https://github.com/defenseunicorns/uds-core/commit/25da98c55a0d10628e3072846b93f2079f21efd9))
* enable linting on test dirs and address eslint/formatting issues ([#1728](https://github.com/defenseunicorns/uds-core/issues/1728)) ([40f484d](https://github.com/defenseunicorns/uds-core/commit/40f484d9c50ebfba08f299d9457e223556e18e9f))
* remove uds-dev-stack namespace from default ignored namespaces ([#1732](https://github.com/defenseunicorns/uds-core/issues/1732)) ([0402455](https://github.com/defenseunicorns/uds-core/commit/040245500eec2106ea467f858c3dca5d2531eb27))

## [0.46.0](https://github.com/defenseunicorns/uds-core/compare/v0.45.1...v0.46.0) (2025-07-08)


### Features

* add lifecycleHooks value to keycloak chart ([#1691](https://github.com/defenseunicorns/uds-core/issues/1691)) ([69d136a](https://github.com/defenseunicorns/uds-core/commit/69d136a0a7309e8c8985829fde4f03a3a02a2127))
* make k3d-core-slim-dev work without internet ([#1681](https://github.com/defenseunicorns/uds-core/issues/1681)) ([016665f](https://github.com/defenseunicorns/uds-core/commit/016665fb5b5648438847692679b18f3ca06b2828))


### Bug Fixes

* grafana logout with refresh token ([#1688](https://github.com/defenseunicorns/uds-core/issues/1688)) ([c760ead](https://github.com/defenseunicorns/uds-core/commit/c760ead5dd554b6082704d24a7cdc90786456d55))
* update rke2 aws-cli install ([#1698](https://github.com/defenseunicorns/uds-core/issues/1698)) ([a1992f0](https://github.com/defenseunicorns/uds-core/commit/a1992f05d035e898e0479a01e0a95ce65afb87df))


### Miscellaneous

* **ci:** check for autogenerated changes ([#1672](https://github.com/defenseunicorns/uds-core/issues/1672)) ([180c925](https://github.com/defenseunicorns/uds-core/commit/180c92517c8d6a19d709408cf470e130c9856ca2))
* **deps:** update eslint to v9.30.0 ([#1682](https://github.com/defenseunicorns/uds-core/issues/1682)) ([ad6cfc4](https://github.com/defenseunicorns/uds-core/commit/ad6cfc495bc19931a6a7cd3050ac750730cf2105))
* **deps:** update grafana ([#1650](https://github.com/defenseunicorns/uds-core/issues/1650)) ([c5f11dc](https://github.com/defenseunicorns/uds-core/commit/c5f11dcb2f1f201965d6d65b3bcbc599ab9c178d))
* **deps:** update istio to v1.26.2 ([#1543](https://github.com/defenseunicorns/uds-core/issues/1543)) ([0b21ac1](https://github.com/defenseunicorns/uds-core/commit/0b21ac19d8713d454caa5baeaafbdf3b2365f2b5))
* **deps:** update k8s-sidecar to 1.30.6 ([#1693](https://github.com/defenseunicorns/uds-core/issues/1693)) ([0c01a66](https://github.com/defenseunicorns/uds-core/commit/0c01a66b0a295195f22d75dcba1e15335417d0ae))
* **deps:** update loki nginx to v1.29 ([#1679](https://github.com/defenseunicorns/uds-core/issues/1679)) ([68b145c](https://github.com/defenseunicorns/uds-core/commit/68b145c5103f3f529937be6c75b4d0ff8d9f990d))
* **deps:** update node globals to v16.3.0 ([#1687](https://github.com/defenseunicorns/uds-core/issues/1687)) ([4d052e9](https://github.com/defenseunicorns/uds-core/commit/4d052e9e9f6f1c721912f057e7ab15b253364629))
* **deps:** update pepr to v9.30.1 ([#1689](https://github.com/defenseunicorns/uds-core/issues/1689)) ([c707759](https://github.com/defenseunicorns/uds-core/commit/c7077599d57a02987e295c773c39fa2b4cefcc98))
* **deps:** update support-deps ([#1675](https://github.com/defenseunicorns/uds-core/issues/1675)) ([a709d73](https://github.com/defenseunicorns/uds-core/commit/a709d73cdbe81a76002c190561e1a76029357452))
* **deps:** update support-deps ([#1683](https://github.com/defenseunicorns/uds-core/issues/1683)) ([1e2b1dc](https://github.com/defenseunicorns/uds-core/commit/1e2b1dcb99ad0745bc5c50bd1e01463c3733a1f1))
* **deps:** update support-deps ([#1685](https://github.com/defenseunicorns/uds-core/issues/1685)) ([34046a3](https://github.com/defenseunicorns/uds-core/commit/34046a32f6acb5f55d824beeb23e79970168c30a))
* **deps:** update uds-core-identity-config to 0.15.2 ([#1695](https://github.com/defenseunicorns/uds-core/issues/1695)) ([d96827c](https://github.com/defenseunicorns/uds-core/commit/d96827ccdcef38136b1cd067400deb5d55d60fa1))
* **deps:** update vector to 0.48.0 ([#1686](https://github.com/defenseunicorns/uds-core/issues/1686)) ([00442ec](https://github.com/defenseunicorns/uds-core/commit/00442eca9b9395198a1c70a75d785e49527636f6))
* update versioning for aws provider ([#1684](https://github.com/defenseunicorns/uds-core/issues/1684)) ([276633c](https://github.com/defenseunicorns/uds-core/commit/276633ce1a9111453819bb61773238111bfb0b10))


### Documentation

* add notes on permissive traffic for authpols ([#1674](https://github.com/defenseunicorns/uds-core/issues/1674)) ([6f8d045](https://github.com/defenseunicorns/uds-core/commit/6f8d0459536ea55181520141f667c5ad00a5aaf1))

## [0.45.1](https://github.com/defenseunicorns/uds-core/compare/v0.45.0...v0.45.1) (2025-06-27)


### Bug Fixes

* documentation and testing of Velero EBS backups ([#1658](https://github.com/defenseunicorns/uds-core/issues/1658)) ([df58bc8](https://github.com/defenseunicorns/uds-core/commit/df58bc8e171476173009dc57d24752e3500a63c7))


### Miscellaneous

* **ci:** upgrade iac clusters to 1.32 ([#1666](https://github.com/defenseunicorns/uds-core/issues/1666)) ([85544f0](https://github.com/defenseunicorns/uds-core/commit/85544f0ceb47b1876f198e177bd12b2e77449971))
* **deps:** update keycloak to v0.15.1 ([#1676](https://github.com/defenseunicorns/uds-core/issues/1676)) ([bc2ff66](https://github.com/defenseunicorns/uds-core/commit/bc2ff66bfef778a0283e141717a764a72beb1ed5))
* **deps:** update pepr to v0.51.5 ([#1668](https://github.com/defenseunicorns/uds-core/issues/1668)) ([52cf841](https://github.com/defenseunicorns/uds-core/commit/52cf84186812c49e166cd3f60144896b267a8576))
* **deps:** update support-deps ([#1669](https://github.com/defenseunicorns/uds-core/issues/1669)) ([d0da547](https://github.com/defenseunicorns/uds-core/commit/d0da547214d21abae8e44456e8e5a75c3cbc4055))


### Documentation

* fix velero frontmatter ([#1667](https://github.com/defenseunicorns/uds-core/issues/1667)) ([d3dfa0b](https://github.com/defenseunicorns/uds-core/commit/d3dfa0ba70a9aed9a162fdf9e272cff97c2cdce3))
* operator resource tree ([#1671](https://github.com/defenseunicorns/uds-core/issues/1671)) ([2a0ec43](https://github.com/defenseunicorns/uds-core/commit/2a0ec4386a52c383887395fd3f1bd1793e567fa2))

## [0.45.0](https://github.com/defenseunicorns/uds-core/compare/v0.44.0...v0.45.0) (2025-06-24)


### ⚠ BREAKING CHANGES

* The new Keycloak Theme provided by the UDS Identity config changes the `themeCustomizations.resources` array and now accepts only PNG images (for example: `background.png` instead of `background.jpg`). If you use this feature, ensure all the images are converted into the PNG format and properly supplied to the configuration.

### Features

* configurable terms and conditions ([#1637](https://github.com/defenseunicorns/uds-core/issues/1637)) ([50524f8](https://github.com/defenseunicorns/uds-core/commit/50524f8a5dd4fbea834a974bb92817862a2730f2))
* new Keycloak theme (https://github.com/defenseunicorns/uds-core/pull/1632) ([cef5f1c](https://github.com/defenseunicorns/uds-core/commit/cef5f1c2a32196178131d43583393665574604ab))
* set keycloak `KC_SPI_X509CERT_LOOKUP` vars from x509 lookup provider ([#1659](https://github.com/defenseunicorns/uds-core/issues/1659)) ([4fe0fcc](https://github.com/defenseunicorns/uds-core/commit/4fe0fcccb301789e427466f5eece81a824434ae5))


### Bug Fixes

* update curl to 8.14.1 (unicorn) for neuvector cronjob ([#1651](https://github.com/defenseunicorns/uds-core/issues/1651)) ([efe8853](https://github.com/defenseunicorns/uds-core/commit/efe8853f41cc037f67b454fc925a0e98f8aae68d))


### Miscellaneous

* **ci:** add iac filter workflow ([#1639](https://github.com/defenseunicorns/uds-core/issues/1639)) ([d1a35a7](https://github.com/defenseunicorns/uds-core/commit/d1a35a71766cd9663c5e0f93a95e0988305e261e))
* **ci:** add owner tags to AKS resources ([#1645](https://github.com/defenseunicorns/uds-core/issues/1645)) ([12d1fa6](https://github.com/defenseunicorns/uds-core/commit/12d1fa6f179d1801a62a864456e441a25a820a03))
* **ci:** migrate to vitest for kfc and pepr updates ([#1642](https://github.com/defenseunicorns/uds-core/issues/1642)) ([92da915](https://github.com/defenseunicorns/uds-core/commit/92da915e2738a134a76fda524a46b3117ab1d6c8))
* **ci:** update to node 24 ([#1649](https://github.com/defenseunicorns/uds-core/issues/1649)) ([d67e263](https://github.com/defenseunicorns/uds-core/commit/d67e263d3232777b650e648b122dd5d3cc7e67fd))
* **deps:** update grafana ([#1647](https://github.com/defenseunicorns/uds-core/issues/1647)) ([d333ba6](https://github.com/defenseunicorns/uds-core/commit/d333ba66dc8ebc53797bc54fe27ddac25ccb313b))
* **deps:** update keycloak to v0.15.0 ([#1664](https://github.com/defenseunicorns/uds-core/issues/1664)) ([6815699](https://github.com/defenseunicorns/uds-core/commit/68156998b002373fcd29c638475e5877a13f9fe7))
* **deps:** update pepr ([#1648](https://github.com/defenseunicorns/uds-core/issues/1648)) ([e27fc8e](https://github.com/defenseunicorns/uds-core/commit/e27fc8e3acf1b6a535d88da9e516e9854caed3f4))
* **deps:** update pepr to v0.51.4 ([#1638](https://github.com/defenseunicorns/uds-core/issues/1638)) ([00d6b94](https://github.com/defenseunicorns/uds-core/commit/00d6b94aa507cf9961ab0c69d25e3994804b4690))
* **deps:** update pepr to v3.2.4 ([#1655](https://github.com/defenseunicorns/uds-core/issues/1655)) ([c522384](https://github.com/defenseunicorns/uds-core/commit/c5223846ee0d07c12403386addc75832df665a24))
* **deps:** update prometheus-stack ([#1603](https://github.com/defenseunicorns/uds-core/issues/1603)) ([8d0db3e](https://github.com/defenseunicorns/uds-core/commit/8d0db3e6c5639b96452f9f9f7ac7e2472565586a))
* **deps:** update support-deps ([#1635](https://github.com/defenseunicorns/uds-core/issues/1635)) ([c478257](https://github.com/defenseunicorns/uds-core/commit/c47825781a6e08b1985174327b3000606ee4366b))
* **deps:** update support-deps ([#1646](https://github.com/defenseunicorns/uds-core/issues/1646)) ([6536218](https://github.com/defenseunicorns/uds-core/commit/65362189dc3d031a1d872c69493b596ba6bc3186))
* **deps:** update support-deps ([#1656](https://github.com/defenseunicorns/uds-core/issues/1656)) ([bdbb2c9](https://github.com/defenseunicorns/uds-core/commit/bdbb2c9e53f80f9b8599d62daeb6c2d28d350c16))
* **deps:** update support-deps ([#1657](https://github.com/defenseunicorns/uds-core/issues/1657)) ([14d2337](https://github.com/defenseunicorns/uds-core/commit/14d2337e3133f27f0cff91a7bd18d353df65272a))
* **deps:** update support-deps ([#1661](https://github.com/defenseunicorns/uds-core/issues/1661)) ([9de7760](https://github.com/defenseunicorns/uds-core/commit/9de7760724644da58c83f477b4b8e4c2c3f87dad))
* **docs:** sanitize docs directory naming ([#1653](https://github.com/defenseunicorns/uds-core/issues/1653)) ([ac3c24e](https://github.com/defenseunicorns/uds-core/commit/ac3c24ea8ad1a48d5936775f743dd7a74ddebfac))
* **docs:** update vector networking example ([#1662](https://github.com/defenseunicorns/uds-core/issues/1662)) ([2a33586](https://github.com/defenseunicorns/uds-core/commit/2a33586cb4e4067aca372d24ec04dd967838ece0))

## [0.44.0](https://github.com/defenseunicorns/uds-core/compare/v0.43.0...v0.44.0) (2025-06-09)


### Features

* ability to add extra datasources to grafana ([#1616](https://github.com/defenseunicorns/uds-core/issues/1616)) ([dba32c5](https://github.com/defenseunicorns/uds-core/commit/dba32c5dd452d27a41ab10dd019752f906acc2af))
* egress gw ([#1331](https://github.com/defenseunicorns/uds-core/issues/1331)) ([b1c905e](https://github.com/defenseunicorns/uds-core/commit/b1c905eb76219af8b7e2edb2501537fc225aa348))
* enable keycloak user event metrics ([#1614](https://github.com/defenseunicorns/uds-core/issues/1614)) ([3077426](https://github.com/defenseunicorns/uds-core/commit/307742684d71e1cfa274f4c0b552d422208879e5))
* migrate to rapidfort images ([#1615](https://github.com/defenseunicorns/uds-core/issues/1615)) ([9f190ae](https://github.com/defenseunicorns/uds-core/commit/9f190ae67429bf92c7709fd262e79b639ac0f5ab))


### Bug Fixes

* checkpoint with istio ambient ([#1617](https://github.com/defenseunicorns/uds-core/issues/1617)) ([e28aca5](https://github.com/defenseunicorns/uds-core/commit/e28aca52ba49a2bd6bbf8909e02feaee0fad59da))
* **ci:** dynamic nodeport for podinfo ([#1634](https://github.com/defenseunicorns/uds-core/issues/1634)) ([2e436e8](https://github.com/defenseunicorns/uds-core/commit/2e436e822a5c91ffaf7c05d86425725f7f61ac28))
* ensure secret name/template get passed to client retry ([#1613](https://github.com/defenseunicorns/uds-core/issues/1613)) ([8090a05](https://github.com/defenseunicorns/uds-core/commit/8090a05f0ed6d0eaba3728224e78c5637e3e7f0c))


### Miscellaneous

* **ci:** trigger iac workflows via label ([#1476](https://github.com/defenseunicorns/uds-core/issues/1476)) ([3e00ff0](https://github.com/defenseunicorns/uds-core/commit/3e00ff0c32a908a53b6c3d7043c68e4c54d4314b))
* **deps:** update eslint to v9.28.0 ([#1622](https://github.com/defenseunicorns/uds-core/issues/1622)) ([4b9d619](https://github.com/defenseunicorns/uds-core/commit/4b9d6191867bcacb1ba7bf999930da0378411c28))
* **deps:** update grafana curl to v8.14.0 ([#1607](https://github.com/defenseunicorns/uds-core/issues/1607)) ([aceafe6](https://github.com/defenseunicorns/uds-core/commit/aceafe6b7d24d84fe163ac71d6753e975726ef8d))
* **deps:** update keycloak to v26.2.5 ([#1605](https://github.com/defenseunicorns/uds-core/issues/1605)) ([d8bc4f8](https://github.com/defenseunicorns/uds-core/commit/d8bc4f8ec35cfca42ce773b53c0a066a1d87f800))
* **deps:** update loki to v6.30.1 ([#1606](https://github.com/defenseunicorns/uds-core/issues/1606)) ([1eb803d](https://github.com/defenseunicorns/uds-core/commit/1eb803d726d8a1aabb98ee696f2462e16efc96f4))
* **deps:** update neuvector updater to v8.14.0 ([#1608](https://github.com/defenseunicorns/uds-core/issues/1608)) ([59b6d47](https://github.com/defenseunicorns/uds-core/commit/59b6d4794705c396f0e15c75820c84b5948c918a))
* **deps:** update pepr to 0.51.0 ([#1602](https://github.com/defenseunicorns/uds-core/issues/1602)) ([bc39f9c](https://github.com/defenseunicorns/uds-core/commit/bc39f9c4b4cbaf7407a70fd7a52f93edd2d8b09d))
* **deps:** update pepr to v0.51.3 ([#1626](https://github.com/defenseunicorns/uds-core/issues/1626)) ([f830eb3](https://github.com/defenseunicorns/uds-core/commit/f830eb3922cbd034c875f9a95d30241857f41f2c))
* **deps:** update support-deps ([#1598](https://github.com/defenseunicorns/uds-core/issues/1598)) ([f325905](https://github.com/defenseunicorns/uds-core/commit/f3259055aa27f3f3b75ffc0ee944068a87aa8adb))
* **deps:** update support-deps ([#1620](https://github.com/defenseunicorns/uds-core/issues/1620)) ([878a6fe](https://github.com/defenseunicorns/uds-core/commit/878a6fe52c44404848c34afc0cc439854bd6b2d5))
* **deps:** update support-deps ([#1627](https://github.com/defenseunicorns/uds-core/issues/1627)) ([f864095](https://github.com/defenseunicorns/uds-core/commit/f8640954ed678fb357baf66c16bba75bfafc1bca))
* **deps:** update support-deps ([#1631](https://github.com/defenseunicorns/uds-core/issues/1631)) ([878c165](https://github.com/defenseunicorns/uds-core/commit/878c165928267f4b69eeec49310672e99571b630))
* remove architecture restriction on registry1 flavor ([#1612](https://github.com/defenseunicorns/uds-core/issues/1612)) ([1298642](https://github.com/defenseunicorns/uds-core/commit/129864213a0da9ebd887e93e70fa1f0454bdbe9c))
* reorganize test packages ([#1629](https://github.com/defenseunicorns/uds-core/issues/1629)) ([5773bee](https://github.com/defenseunicorns/uds-core/commit/5773beeec5aaa969f5e8e0aaedf1e89b9902888f))
* switch to rapidfort vector fips image ([#1628](https://github.com/defenseunicorns/uds-core/issues/1628)) ([d2f0853](https://github.com/defenseunicorns/uds-core/commit/d2f085352fe6f4f73d60991b0dd8e793c57ce2ce))

## [0.43.0](https://github.com/defenseunicorns/uds-core/compare/v0.42.0...v0.43.0) (2025-05-27)


### ⚠ BREAKING CHANGES

* UDS Core now uses Keycloak in FIPS (STRICT) mode by default (the `fips` Helm Chart flag is set to `true` by default). In some environments, this may be a breaking change that could result in the Keycloak Administrator account being locked out. Before upgrading, please ensure you have read and followed the [UDS Identity v0.14.0 upgrade guide](https://uds.defenseunicorns.com/reference/uds-core/idam/upgrading-versions/#v0140).

### Features

* add grafana dashboard for istio mode comparison ([#1582](https://github.com/defenseunicorns/uds-core/issues/1582)) ([fc6d36b](https://github.com/defenseunicorns/uds-core/commit/fc6d36bf0fc347eff67f94e068aac78c72a7c7a1))
* enable Keycloak FIPS mode by default ([#1518](https://github.com/defenseunicorns/uds-core/issues/1518)) ([fe6482a](https://github.com/defenseunicorns/uds-core/commit/fe6482ab047df3f88d495bfb2ae8ecfd50f98b16))
* opt neuvector into ambient ([#1498](https://github.com/defenseunicorns/uds-core/issues/1498)) ([44ed89e](https://github.com/defenseunicorns/uds-core/commit/44ed89e0ce9e3f4dcdb5ca0a5387ee7e247eb936))
* support Istio TLS certificate at server level ([#1552](https://github.com/defenseunicorns/uds-core/issues/1552)) ([3b12a40](https://github.com/defenseunicorns/uds-core/commit/3b12a40746f4f82b70cae3b3f9b6ca4b4dda0556))


### Bug Fixes

* allow OIDC logout from NeuVector ([#1580](https://github.com/defenseunicorns/uds-core/issues/1580)) ([9c9e51f](https://github.com/defenseunicorns/uds-core/commit/9c9e51f65e9e06946861af5b5f54a83e8a975667))
* **ci:** add maru auth for remote tasks ([#1579](https://github.com/defenseunicorns/uds-core/issues/1579)) ([75eb53b](https://github.com/defenseunicorns/uds-core/commit/75eb53b1e13239c6ba458392cdb014a912ce336b))
* ensure uniqueness of sso client ids in cluster ([#1589](https://github.com/defenseunicorns/uds-core/issues/1589)) ([be4ff0c](https://github.com/defenseunicorns/uds-core/commit/be4ff0cad7e41e34a11b83ec813e6588437eaa64))
* keycloak sts devmode db settings ([#1566](https://github.com/defenseunicorns/uds-core/issues/1566)) ([e79bdf4](https://github.com/defenseunicorns/uds-core/commit/e79bdf4e2d0335ee05e14687a4adab357073b24e))
* remove duplicate ha test ([#1597](https://github.com/defenseunicorns/uds-core/issues/1597)) ([7666666](https://github.com/defenseunicorns/uds-core/commit/766666648e9d5cdb42748e5b4fdff16e1e9f3437))
* update namespace template for pepr to use ambient label ([#1568](https://github.com/defenseunicorns/uds-core/issues/1568)) ([52b9904](https://github.com/defenseunicorns/uds-core/commit/52b9904f894f7fdd6224ce4f5c6c782a115788c9))


### Miscellaneous

* add keycloak attributes `saml.encrypt`, `saml_name_id_format`, `saml.signing.certificate` ([#1557](https://github.com/defenseunicorns/uds-core/issues/1557)) ([f8a2dc4](https://github.com/defenseunicorns/uds-core/commit/f8a2dc4446804a001ddb4c8713421f57ec2ed880))
* change default cve scan severity to negligible ([#1574](https://github.com/defenseunicorns/uds-core/issues/1574)) ([f7ca5a0](https://github.com/defenseunicorns/uds-core/commit/f7ca5a04b97a5735452ac92697b93050ae2ac86c))
* **ci:** add HA install and upgrade nightly tests ([#1578](https://github.com/defenseunicorns/uds-core/issues/1578)) ([51fd9a4](https://github.com/defenseunicorns/uds-core/commit/51fd9a4edddcf8a04a69b94d375b2e4b60ac52df))
* **ci:** add renovate-readiness to HA workflow ([#1587](https://github.com/defenseunicorns/uds-core/issues/1587)) ([353347e](https://github.com/defenseunicorns/uds-core/commit/353347ef056df84dc11726bc8b778ec6edd25d7c))
* **deps:** update grafana to v12.0.1 ([#1510](https://github.com/defenseunicorns/uds-core/issues/1510)) ([1b5914d](https://github.com/defenseunicorns/uds-core/commit/1b5914db2312120c32a86fd8b38192a93448e18f))
* **deps:** update identity-config to v0.14.1 ([#1600](https://github.com/defenseunicorns/uds-core/issues/1600)) ([892762c](https://github.com/defenseunicorns/uds-core/commit/892762c7552e064cd28a31dd1f6dea4d629c5d19))
* **deps:** update loki to 3.5.1 ([#1585](https://github.com/defenseunicorns/uds-core/issues/1585)) ([e74ea78](https://github.com/defenseunicorns/uds-core/commit/e74ea786b42d18a247dd1ab19e6014529cf7bd32))
* **deps:** update neuvector to 5.4.4 ([#1559](https://github.com/defenseunicorns/uds-core/issues/1559)) ([4b3b10d](https://github.com/defenseunicorns/uds-core/commit/4b3b10d1eeebce2effe7463ac2b753b3c674f78a))
* **deps:** update neuvector ubi9 to v9.6 ([#1563](https://github.com/defenseunicorns/uds-core/issues/1563)) ([173889f](https://github.com/defenseunicorns/uds-core/commit/173889fa2b0447176271a2c703473fa23e4a85fe))
* **deps:** update pepr to v0.50.0 ([#1562](https://github.com/defenseunicorns/uds-core/issues/1562)) ([dafff9b](https://github.com/defenseunicorns/uds-core/commit/dafff9bc1bee377adbf9c51f01aac64b406c0b1b))
* **deps:** update prometheus-stack ([#1434](https://github.com/defenseunicorns/uds-core/issues/1434)) ([03c92d5](https://github.com/defenseunicorns/uds-core/commit/03c92d52f001963955b968dce58a99eac402a949))
* **deps:** update support-deps ([#1556](https://github.com/defenseunicorns/uds-core/issues/1556)) ([79db725](https://github.com/defenseunicorns/uds-core/commit/79db725612d9decf3e685df32c81d6563bf74dca))
* **deps:** update support-deps ([#1565](https://github.com/defenseunicorns/uds-core/issues/1565)) ([60a84c6](https://github.com/defenseunicorns/uds-core/commit/60a84c630f3543fe222d7cfaecc533856ba7d555))
* **deps:** update ts-jest to v29.3.4 ([#1573](https://github.com/defenseunicorns/uds-core/issues/1573)) ([c741920](https://github.com/defenseunicorns/uds-core/commit/c7419204ef0887e489e6bd74e6bded1260f5291e))
* **deps:** update vector to v0.47.0 ([#1583](https://github.com/defenseunicorns/uds-core/issues/1583)) ([ef6e718](https://github.com/defenseunicorns/uds-core/commit/ef6e718ed5b80a710e476084410ae5f36d2ffefd))
* **deps:** update velero kubectl images ([#1505](https://github.com/defenseunicorns/uds-core/issues/1505)) ([d77901c](https://github.com/defenseunicorns/uds-core/commit/d77901c632b996f6c8832f6b94dca0827fab76c8))
* **deps:** update velero to v1.16.1, plugins to v1.12.1 ([#1576](https://github.com/defenseunicorns/uds-core/issues/1576)) ([bee6007](https://github.com/defenseunicorns/uds-core/commit/bee6007d232c8cc0064392aef12e884ccf2b5254))
* **docs:** new ambient transition policy doc ([#1577](https://github.com/defenseunicorns/uds-core/issues/1577)) ([8f9b2c2](https://github.com/defenseunicorns/uds-core/commit/8f9b2c2b34f22d599a4981579484802506b1c252))
* **docs:** update ambient docs ([#1571](https://github.com/defenseunicorns/uds-core/issues/1571)) ([296838c](https://github.com/defenseunicorns/uds-core/commit/296838c467ab118e14368d936cac273094906f6d))
* **doc:** update changelog ([#1558](https://github.com/defenseunicorns/uds-core/issues/1558)) ([e9f4d24](https://github.com/defenseunicorns/uds-core/commit/e9f4d24e4ff662517ab4943884a668fdff425113))
* remove old misc cacert from admin gateway ([#1561](https://github.com/defenseunicorns/uds-core/issues/1561)) ([10cafee](https://github.com/defenseunicorns/uds-core/commit/10cafee742650a7e6e2cf4b15080cf0902a0ca68))
* switch gateway crd install to release artifacts ([#1572](https://github.com/defenseunicorns/uds-core/issues/1572)) ([76db3ac](https://github.com/defenseunicorns/uds-core/commit/76db3acde24f19b598be47c8f1364b0cd582858c))
* switch to vector fips image ([#1584](https://github.com/defenseunicorns/uds-core/issues/1584)) ([f8394e6](https://github.com/defenseunicorns/uds-core/commit/f8394e6bfca079b67365ac02aca390941b6d2566))
* update ca certs in istio gateways ([#1567](https://github.com/defenseunicorns/uds-core/issues/1567)) ([03053fd](https://github.com/defenseunicorns/uds-core/commit/03053fdc377ed7636593d1c392c1e69ae5103a74))

## [0.42.0](https://github.com/defenseunicorns/uds-core/compare/v0.41.2...v0.42.0) (2025-05-12)


### ⚠ BREAKING CHANGES

* This release switches the default way that the UDS Operator creates and manages Keycloak clients. Make sure you have followed the 0.11.0 realm updates for identity-config if upgrading an existing installation. Realm upgrades are not currently automated and the upgrade steps for the new client credentials are required.

### Features

* ability to add adminUrl to Keycloak client ([#1545](https://github.com/defenseunicorns/uds-core/issues/1545)) ([9a155eb](https://github.com/defenseunicorns/uds-core/commit/9a155eb268ca6e97a543df7faa8056276c6960a9))
* add saml_idp_initiated_sso_url_name to allowed keycloak attributes ([#1539](https://github.com/defenseunicorns/uds-core/issues/1539)) ([01217e8](https://github.com/defenseunicorns/uds-core/commit/01217e88df089d35ee55339dcb395adf9963d6d4))
* add support for `use.refresh.tokens` keycloak attribute ([#1536](https://github.com/defenseunicorns/uds-core/issues/1536)) ([b21ef54](https://github.com/defenseunicorns/uds-core/commit/b21ef544771390a99bbcc7d9193eb52015cb1396))
* configurable Istio mtlsClientCert ([#1553](https://github.com/defenseunicorns/uds-core/issues/1553)) ([c34047e](https://github.com/defenseunicorns/uds-core/commit/c34047e26bb7edb01d09b31184c9c426ad22b4f6))
* configurable tls redirect ([#1522](https://github.com/defenseunicorns/uds-core/issues/1522)) ([e1c4afd](https://github.com/defenseunicorns/uds-core/commit/e1c4afd8c22d724d0def131662cfe65a8dc947d6))
* configurable x509 lookup provider for keycloak ([#1521](https://github.com/defenseunicorns/uds-core/issues/1521)) ([41342b4](https://github.com/defenseunicorns/uds-core/commit/41342b4cd8829a720eff5d83f42ecf70b55d3af2))
* keycloak ambient opt in ([#1504](https://github.com/defenseunicorns/uds-core/issues/1504)) ([0ea0666](https://github.com/defenseunicorns/uds-core/commit/0ea0666a7e992f94df70a163fb987498f383862f))
* keycloak fips ([#1537](https://github.com/defenseunicorns/uds-core/issues/1537)) ([476ed07](https://github.com/defenseunicorns/uds-core/commit/476ed0731c41ab4f511ac06aea8dea62826e1d2c))
* opt authservice into ambient mode ([#1514](https://github.com/defenseunicorns/uds-core/issues/1514)) ([606074c](https://github.com/defenseunicorns/uds-core/commit/606074c7f6d9bfbb0f84bb8679e609eb3d89ccf2))


### Bug Fixes

* add support for client name in pepr types ([#1535](https://github.com/defenseunicorns/uds-core/issues/1535)) ([c29e4cb](https://github.com/defenseunicorns/uds-core/commit/c29e4cb6ca4c0d578202f3175fcf311c03507b49))
* remove dynamic client registration ([#1479](https://github.com/defenseunicorns/uds-core/issues/1479)) ([3f4510e](https://github.com/defenseunicorns/uds-core/commit/3f4510eada55b0109cb2507045c408b4a812bc76))


### Miscellaneous

* **ci:** mark auth related vars as sensitive ([#1546](https://github.com/defenseunicorns/uds-core/issues/1546)) ([87ffc18](https://github.com/defenseunicorns/uds-core/commit/87ffc18ac2c35c116a56b3681be8969f60dfd705))
* **deps:** update identity-config v0.14.0 ([#1555](https://github.com/defenseunicorns/uds-core/issues/1555)) ([b3f83c1](https://github.com/defenseunicorns/uds-core/commit/b3f83c1db18e17254a477c8e649b1e8572fa8f76))
* **deps:** update keycloak to v26.2.3 ([#1523](https://github.com/defenseunicorns/uds-core/issues/1523)) ([7c354d3](https://github.com/defenseunicorns/uds-core/commit/7c354d3b1a78a9fb209548e1bd404f70ad8320e4))
* **deps:** update keycloak to v26.2.4 ([#1544](https://github.com/defenseunicorns/uds-core/issues/1544)) ([680f55e](https://github.com/defenseunicorns/uds-core/commit/680f55ec41b6108541c980a3a049b0e8cae9f099))
* **deps:** update pepr to v15.5.2 ([#1531](https://github.com/defenseunicorns/uds-core/issues/1531)) ([0aa2874](https://github.com/defenseunicorns/uds-core/commit/0aa28747cf52f67654e0654f9671ff5920ebc203))
* **deps:** update pepr to v16 ([#1554](https://github.com/defenseunicorns/uds-core/issues/1554)) ([add9277](https://github.com/defenseunicorns/uds-core/commit/add9277f7aa0d6ea7f283ffe2e989c5c3e5247ec))
* **deps:** update support dependencies to v3.5.3 ([#1538](https://github.com/defenseunicorns/uds-core/issues/1538)) ([151e65b](https://github.com/defenseunicorns/uds-core/commit/151e65b7eb5d3436ff1ac63addbd78968e954137))
* **deps:** update support-deps ([#1520](https://github.com/defenseunicorns/uds-core/issues/1520)) ([34015a3](https://github.com/defenseunicorns/uds-core/commit/34015a3a7a8773172cedb54c654f2847f9659eb3))
* **deps:** update support-deps ([#1540](https://github.com/defenseunicorns/uds-core/issues/1540)) ([4ce2399](https://github.com/defenseunicorns/uds-core/commit/4ce2399a6a00684739a95cba801573f258554b3e))
* use built-in sdk for containers ([#1530](https://github.com/defenseunicorns/uds-core/issues/1530)) ([1e045ac](https://github.com/defenseunicorns/uds-core/commit/1e045acffecc60c38d6a59697c20c6ab2afc3610))

## [0.41.2](https://github.com/defenseunicorns/uds-core/compare/v0.41.1...v0.41.2) (2025-05-06)


### Bug Fixes

* **ci:** add postgres/HA keycloak to EKS and AKS testing ([#1516](https://github.com/defenseunicorns/uds-core/issues/1516)) ([4026162](https://github.com/defenseunicorns/uds-core/commit/4026162f08ad1b0eef61ca4eaff92471766105c5))
* errors on re-creating checkpoint cluster due to leftover files ([#1528](https://github.com/defenseunicorns/uds-core/issues/1528)) ([f7f1bf4](https://github.com/defenseunicorns/uds-core/commit/f7f1bf4f7e8eff87120b1bf99a554aa651f20590))
* keycloak clustering ([#1529](https://github.com/defenseunicorns/uds-core/issues/1529)) ([bb29000](https://github.com/defenseunicorns/uds-core/commit/bb29000b6aba2863c593044466b0233dc193f513))


### Miscellaneous

* **deps:** update identity-config to v0.13.1 ([#1532](https://github.com/defenseunicorns/uds-core/issues/1532)) ([b349e9b](https://github.com/defenseunicorns/uds-core/commit/b349e9b8f1152be4a1ecab0a591634d9d9f22fa8))
* **deps:** update keycloak to v26.2.2 ([#1512](https://github.com/defenseunicorns/uds-core/issues/1512)) ([0969468](https://github.com/defenseunicorns/uds-core/commit/0969468f7867d0aca3b135099ebf00e9f5566ba9))
* **deps:** update pepr to v0.49.0 ([#1511](https://github.com/defenseunicorns/uds-core/issues/1511)) ([ec9e924](https://github.com/defenseunicorns/uds-core/commit/ec9e924033aa16b1769d9ad64b209dd68b687966))
* **deps:** update support-deps ([#1503](https://github.com/defenseunicorns/uds-core/issues/1503)) ([dffe4a4](https://github.com/defenseunicorns/uds-core/commit/dffe4a4d16a9f5f6eba91ea161960b6fcb1ec56d))
* **doc:** remove keycloak prereq ([#1519](https://github.com/defenseunicorns/uds-core/issues/1519)) ([adbbbc9](https://github.com/defenseunicorns/uds-core/commit/adbbbc90e146b6227a487256ec6575c227536aad))
* pod anti-affinity for istiod, troubleshooting doc for webhook issue (https://github.com/defenseunicorns/uds-core/pull/1509) ([2a2b299](https://github.com/defenseunicorns/uds-core/commit/2a2b2991f894930de01f96f4e9f8bdfe053d5567))

## [0.41.1](https://github.com/defenseunicorns/uds-core/compare/v0.41.0...v0.41.1) (2025-04-30)


### Bug Fixes

* unconditionally mutate neuvector probes ([#1513](https://github.com/defenseunicorns/uds-core/issues/1513)) ([9228e33](https://github.com/defenseunicorns/uds-core/commit/9228e3358ec849df0894a94875985cddb6551959))

## [0.41.0](https://github.com/defenseunicorns/uds-core/compare/v0.40.1...v0.41.0) (2025-04-28)


### Features

* add conditional netpol for coredns ([#1501](https://github.com/defenseunicorns/uds-core/issues/1501)) ([fc7ace3](https://github.com/defenseunicorns/uds-core/commit/fc7ace3a1d56524dc1f03296fc13a482aaad1911))
* client credential registration default ([#1482](https://github.com/defenseunicorns/uds-core/issues/1482)) ([894c5d9](https://github.com/defenseunicorns/uds-core/commit/894c5d940cd614a1cd5f8d4539e4f340bc1dbf06))
* keycloak fips mode ([#1469](https://github.com/defenseunicorns/uds-core/issues/1469)) ([74e632e](https://github.com/defenseunicorns/uds-core/commit/74e632efd6a5be5cc66441d412a3b49733f29576))
* operator ambient mode ([#1496](https://github.com/defenseunicorns/uds-core/issues/1496)) ([71f03fd](https://github.com/defenseunicorns/uds-core/commit/71f03fd284db5be77b7a6550c972ea80036eb422))
* opt Grafana into ambient ([#1466](https://github.com/defenseunicorns/uds-core/issues/1466)) ([dac2d3e](https://github.com/defenseunicorns/uds-core/commit/dac2d3ecd5ea1ff1a8898458aff756bec11ab200))
* opt logging into ambient ([#1472](https://github.com/defenseunicorns/uds-core/issues/1472)) ([117d586](https://github.com/defenseunicorns/uds-core/commit/117d586658cc0e6a111abe13c65acf229996a89d))
* opt metrics-server into ambient ([#1458](https://github.com/defenseunicorns/uds-core/issues/1458)) ([01c2ec6](https://github.com/defenseunicorns/uds-core/commit/01c2ec6f9804c6f7af70b8d7ecfc565d53ec25a2))
* opt velero into ambient ([#1490](https://github.com/defenseunicorns/uds-core/issues/1490)) ([a0591c7](https://github.com/defenseunicorns/uds-core/commit/a0591c7807631bc779b210fb2b292d0365e1edf1))


### Bug Fixes

* **ci:** permissions on release workflow ([#1507](https://github.com/defenseunicorns/uds-core/issues/1507)) ([cb12f13](https://github.com/defenseunicorns/uds-core/commit/cb12f13f64a77488c59e5294cca31de0f3dbd494))
* **ci:** renovate readiness version loop fix ([#1488](https://github.com/defenseunicorns/uds-core/issues/1488)) ([a40c15b](https://github.com/defenseunicorns/uds-core/commit/a40c15b31d8e5dda95c8df0fc232433c9507ca25))
* update loki images to fips images ([#1502](https://github.com/defenseunicorns/uds-core/issues/1502)) ([eb20b4e](https://github.com/defenseunicorns/uds-core/commit/eb20b4e4a5a9c8c9b9743af97d99d332641753ec))


### Miscellaneous

* **ci:** automated renovate readiness action checks ([#1465](https://github.com/defenseunicorns/uds-core/issues/1465)) ([ed0ca6b](https://github.com/defenseunicorns/uds-core/commit/ed0ca6b7b951d9e014e1040dc030e45e89a8cfcc))
* **ci:** switch eks CI to FIPS ami, update to 1.31 k8s testing ([#1474](https://github.com/defenseunicorns/uds-core/issues/1474)) ([7307d03](https://github.com/defenseunicorns/uds-core/commit/7307d03de48efe79171c1bd4818e0036b09833b6))
* **deps:** update grafana ([#1489](https://github.com/defenseunicorns/uds-core/issues/1489)) ([0c063f1](https://github.com/defenseunicorns/uds-core/commit/0c063f1b7e53fad7e17395d0f60f1c9cb8f0b930))
* **deps:** update istio to v1.25.2 ([#1461](https://github.com/defenseunicorns/uds-core/issues/1461)) ([1067560](https://github.com/defenseunicorns/uds-core/commit/1067560b7295fad5b4c2f40e18f989c22fc9c4f2))
* **deps:** update istio to v1.3.0 ([#1491](https://github.com/defenseunicorns/uds-core/issues/1491)) ([9066584](https://github.com/defenseunicorns/uds-core/commit/906658400820cb3aad62e1a06a73e721c6b7c7a2))
* **deps:** update keycloak to v0.13.0 ([#1506](https://github.com/defenseunicorns/uds-core/issues/1506)) ([04d42ef](https://github.com/defenseunicorns/uds-core/commit/04d42ef1b907f39aaf75c3cbe041963f7989a0d1))
* **deps:** update keycloak to v26.2.0 ([#1452](https://github.com/defenseunicorns/uds-core/issues/1452)) ([927a57b](https://github.com/defenseunicorns/uds-core/commit/927a57ba9042d6cde5507dbcf0e8c5d35e568548))
* **deps:** update keycloak to v26.2.1 ([#1486](https://github.com/defenseunicorns/uds-core/issues/1486)) ([d68cad8](https://github.com/defenseunicorns/uds-core/commit/d68cad88e6e680d47423aecd3678d50bfdef03fb))
* **deps:** update loki ([#1483](https://github.com/defenseunicorns/uds-core/issues/1483)) ([3a697df](https://github.com/defenseunicorns/uds-core/commit/3a697df8f372332ecba338a41b4164cd89bdf974))
* **deps:** update neuvector ([#1417](https://github.com/defenseunicorns/uds-core/issues/1417)) ([4c0d95d](https://github.com/defenseunicorns/uds-core/commit/4c0d95db6239ccf6f06acbbc1b708506dea0d0fc))
* **deps:** update pepr ([#1454](https://github.com/defenseunicorns/uds-core/issues/1454)) ([a98640f](https://github.com/defenseunicorns/uds-core/commit/a98640f115c690d3497ce0b94b70b7574f0a48be))
* **deps:** update support dependencies to v4.7.0 ([#1477](https://github.com/defenseunicorns/uds-core/issues/1477)) ([dcee0a3](https://github.com/defenseunicorns/uds-core/commit/dcee0a316898c819bf98f848a4d6a75086a32b46))
* **deps:** update support-deps ([#1473](https://github.com/defenseunicorns/uds-core/issues/1473)) ([3d9d501](https://github.com/defenseunicorns/uds-core/commit/3d9d50101da2d607721b6c31df78d3a202635441))
* **deps:** update support-deps ([#1480](https://github.com/defenseunicorns/uds-core/issues/1480)) ([c41f359](https://github.com/defenseunicorns/uds-core/commit/c41f35988b100f0c7d3050cade52a6d3b234bf7f))
* **deps:** update support-deps ([#1481](https://github.com/defenseunicorns/uds-core/issues/1481)) ([cc2af2b](https://github.com/defenseunicorns/uds-core/commit/cc2af2bd0ce7c4e35a0fd3d77103172d5dec9387))
* **deps:** update support-deps ([#1487](https://github.com/defenseunicorns/uds-core/issues/1487)) ([cdcba75](https://github.com/defenseunicorns/uds-core/commit/cdcba758af2cede8dbfbce28cd050588265c7360))
* **deps:** update support-deps ([#1493](https://github.com/defenseunicorns/uds-core/issues/1493)) ([88cbf29](https://github.com/defenseunicorns/uds-core/commit/88cbf29b1958a6d904f41c6c60a1839eff40310b))
* **deps:** update support-deps ([#1497](https://github.com/defenseunicorns/uds-core/issues/1497)) ([f308176](https://github.com/defenseunicorns/uds-core/commit/f3081760c4b3696cbba4b00482d0ecfa62ede83f))
* **deps:** update velero ([#1453](https://github.com/defenseunicorns/uds-core/issues/1453)) ([7330ea9](https://github.com/defenseunicorns/uds-core/commit/7330ea92e346aaa525a182916d41d3a2dad8e8c4))
* **deps:** update velero ([#1492](https://github.com/defenseunicorns/uds-core/issues/1492)) ([ff504c0](https://github.com/defenseunicorns/uds-core/commit/ff504c0297e4ce49576d62736cf3b591ed5b237b))
* **deps:** update velero to v1.32.4 ([#1484](https://github.com/defenseunicorns/uds-core/issues/1484)) ([06709e8](https://github.com/defenseunicorns/uds-core/commit/06709e89203c1afc202d877ff5bda66e649d9efa))

## [0.40.1](https://github.com/defenseunicorns/uds-core/compare/v0.40.0...v0.40.1) (2025-04-17)


### Bug Fixes

* update prometheus-operator to allow TLS 1.2 healthprobes ([#1471](https://github.com/defenseunicorns/uds-core/issues/1471)) ([7bed436](https://github.com/defenseunicorns/uds-core/commit/7bed436e0e7afc650560034cb7906acc9182f033))


### Miscellaneous

* add docs for wiring in pre-reqs for S3/MetalLB ([#1235](https://github.com/defenseunicorns/uds-core/issues/1235)) ([16ad626](https://github.com/defenseunicorns/uds-core/commit/16ad626e4d05acadfcd7bd6f0d9794974988cb82))
* **deps:** update grafana ([#1464](https://github.com/defenseunicorns/uds-core/issues/1464)) ([e0c8701](https://github.com/defenseunicorns/uds-core/commit/e0c87012691f041762c41d07e8f2f36f7288bdac))
* **deps:** update grafana to v8.11.1 ([#1405](https://github.com/defenseunicorns/uds-core/issues/1405)) ([9a4b8fe](https://github.com/defenseunicorns/uds-core/commit/9a4b8fe66ebb8603548585f1d7044015d856907f))
* **deps:** update loki to v1.27.5 ([#1468](https://github.com/defenseunicorns/uds-core/issues/1468)) ([b9c37a4](https://github.com/defenseunicorns/uds-core/commit/b9c37a489f53c3470e0458a984a1330cafc5eedb))
* **deps:** update support-deps ([#1463](https://github.com/defenseunicorns/uds-core/issues/1463)) ([7d81e18](https://github.com/defenseunicorns/uds-core/commit/7d81e1898ed5779e08fbd0f2ddc2bff5b1c38107))
* **deps:** update vector to 0.46.1 ([#1460](https://github.com/defenseunicorns/uds-core/issues/1460)) ([ce0646b](https://github.com/defenseunicorns/uds-core/commit/ce0646bfc3fb44a24c06f939e04c6f40955a71c8))
* **docs:** zarf package annotations ([#1429](https://github.com/defenseunicorns/uds-core/issues/1429)) ([d45dc83](https://github.com/defenseunicorns/uds-core/commit/d45dc83bdd91d9fce74aa0a8331a0f57e4567d14))
* enable netpols for eks ([#1467](https://github.com/defenseunicorns/uds-core/issues/1467)) ([2a78317](https://github.com/defenseunicorns/uds-core/commit/2a78317b63c3363402e016de36e540015ab68441))

## [0.40.0](https://github.com/defenseunicorns/uds-core/compare/v0.39.0...v0.40.0) (2025-04-14)


### ⚠ BREAKING CHANGES

* ServiceMonitors and PodMonitors no longer require TLS configuration for Istio, and may fail to scrape metrics if TLS configuration is present. The UDS Operator will handle removing this configuration from monitors in most cases, but may not update your monitor if TLS configuration was directly added separate from the Operator's mutations. In addition, the `istio-certs` and `exempt` scrape classes are no longer supplied as part of the Prometheus setup and should not be set on your monitoring resources going forward.
* `Package` CR validation will now prevent creating multiple `Package` CRs in the same namespace. Ensure that you only have a single `Package` CR per namespace before this upgrade, otherwise you may be unable to update them going forward.
* Istio Ambient workloads are now included by default with UDS Core. These workloads are now part of the `istio-controlplane` component (previously part of the optional `istio-ambient` component) - any override values/configuration should target this component instead of `istio-ambient`.
* Theming configuration for removing additional registration fields has moved under the `themeCustomizations` values (`settings.enableRegistrationFields`). If overriding `DISABLE_REGISTRATION_FIELDS` under `realmInitEnv`, you will need to switch to this new value.

### Features

* add serviceMesh.mode in Package CR ([#1386](https://github.com/defenseunicorns/uds-core/issues/1386)) ([7e50b5d](https://github.com/defenseunicorns/uds-core/commit/7e50b5d591a93e1c6117f52d45f48b37950ef3f1))
* escape slashes in Keycloak Group names ([#1433](https://github.com/defenseunicorns/uds-core/issues/1433)) ([6b6be2d](https://github.com/defenseunicorns/uds-core/commit/6b6be2d66f64b80b3ac3e5389c1a5f7c1c5b2e99))
* make istio ambient components default in uds core ([#1428](https://github.com/defenseunicorns/uds-core/issues/1428)) ([32d2752](https://github.com/defenseunicorns/uds-core/commit/32d275223c4e4ad305ab6a8e3f902133743fc1c0))
* only allow creation of one `UDSPackage` per namespace ([#1372](https://github.com/defenseunicorns/uds-core/issues/1372)) ([2f4dbac](https://github.com/defenseunicorns/uds-core/commit/2f4dbac60ee17afe07a4ce62f96285a0e0f04e47))
* opt prometheus stack into ambient ([#1445](https://github.com/defenseunicorns/uds-core/issues/1445)) ([793ccb8](https://github.com/defenseunicorns/uds-core/commit/793ccb87642bad0062cdd92de65f319829aa7001))
* recovering lost Keycloak credentials ([#1410](https://github.com/defenseunicorns/uds-core/issues/1410)) ([0f3b536](https://github.com/defenseunicorns/uds-core/commit/0f3b536015ae28e153956bdd26989be33257b7e5))
* task cleanup for Keycloak ([#1448](https://github.com/defenseunicorns/uds-core/issues/1448)) ([5af6f2b](https://github.com/defenseunicorns/uds-core/commit/5af6f2b0bf0eecda021800693e4c8ba11e0c1d45))


### Bug Fixes

* authpol remoteserviceaccount enablement ([#1415](https://github.com/defenseunicorns/uds-core/issues/1415)) ([c6ae565](https://github.com/defenseunicorns/uds-core/commit/c6ae565bbaf2b958ccf01a1e292ee9038bef7f5f))
* conditional pepr build in tasks ([#1414](https://github.com/defenseunicorns/uds-core/issues/1414)) ([ea75df2](https://github.com/defenseunicorns/uds-core/commit/ea75df2ad409ff48f9859aeb848c8af2df2434d6))
* make exemptions conditional for `dev-setup` ([#1442](https://github.com/defenseunicorns/uds-core/issues/1442)) ([4d7b471](https://github.com/defenseunicorns/uds-core/commit/4d7b471c1c15622871ecd537710c6096317f148e))
* move disable registration fields to theme values ([#1397](https://github.com/defenseunicorns/uds-core/issues/1397)) ([61c67f0](https://github.com/defenseunicorns/uds-core/commit/61c67f0731734b92e96842163f48a7319d3b2156))
* remove flavor from dev deploy of prom CRDs task ([#1419](https://github.com/defenseunicorns/uds-core/issues/1419)) ([10c9ff2](https://github.com/defenseunicorns/uds-core/commit/10c9ff23b74c8f22e47e53767ea963368d7f381d))


### Miscellaneous

* **ci:** add e2e tests for cloud distros ([#1259](https://github.com/defenseunicorns/uds-core/issues/1259)) ([b116a96](https://github.com/defenseunicorns/uds-core/commit/b116a96359406f80d5ea4347d78bd77c14c4ea5a))
* **deps:** update istio to v1.25.1 ([#1387](https://github.com/defenseunicorns/uds-core/issues/1387)) ([c538ef4](https://github.com/defenseunicorns/uds-core/commit/c538ef4a5671f8157880422cd88baa8e304f4f9b))
* **deps:** update loki ([#1349](https://github.com/defenseunicorns/uds-core/issues/1349)) ([f087f55](https://github.com/defenseunicorns/uds-core/commit/f087f55b64cd13578e9b9d1c652ae69ca1a0c694))
* **deps:** update loki to v3.4.3 ([#1426](https://github.com/defenseunicorns/uds-core/issues/1426)) ([cc7fbd1](https://github.com/defenseunicorns/uds-core/commit/cc7fbd198fa429e8dd48fafa61bca8cf8742b480))
* **deps:** update neuvector to 5.4.3 ([#1368](https://github.com/defenseunicorns/uds-core/issues/1368)) ([6c4b44e](https://github.com/defenseunicorns/uds-core/commit/6c4b44e969aa633726f0ed70f2e5ccf7c88dcc9b))
* **deps:** update prometheus-stack ([#1402](https://github.com/defenseunicorns/uds-core/issues/1402)) ([707b07d](https://github.com/defenseunicorns/uds-core/commit/707b07d4f17a872859c77cf9480433f277a006fa))
* **deps:** update support dependencies to v3.28.14 ([#1435](https://github.com/defenseunicorns/uds-core/issues/1435)) ([d29d1b5](https://github.com/defenseunicorns/uds-core/commit/d29d1b5abfe484747631b53b7475af83fa7946d0))
* **deps:** update support dependencies to v3.28.15 ([#1441](https://github.com/defenseunicorns/uds-core/issues/1441)) ([1e7ebce](https://github.com/defenseunicorns/uds-core/commit/1e7ebce255256c3b3bb7a5407acdd43473fb918f))
* **deps:** update support dependencies to v3.4.8 ([#1450](https://github.com/defenseunicorns/uds-core/issues/1450)) ([598242b](https://github.com/defenseunicorns/uds-core/commit/598242bdcc77f164d124459a169729905d933394))
* **deps:** update support dependencies to v4.6.1 ([#1451](https://github.com/defenseunicorns/uds-core/issues/1451)) ([efb22ab](https://github.com/defenseunicorns/uds-core/commit/efb22ab920b1972a0bfe0d3deb220ad80c2a040c))
* **deps:** update support-deps ([#1409](https://github.com/defenseunicorns/uds-core/issues/1409)) ([d1ade16](https://github.com/defenseunicorns/uds-core/commit/d1ade16d282b78f1dd35b9ced2a4979672f534a1))
* **deps:** update support-deps ([#1418](https://github.com/defenseunicorns/uds-core/issues/1418)) ([0eecf5f](https://github.com/defenseunicorns/uds-core/commit/0eecf5ff47d0b1388f99261b24f0e919db9b7829))
* **deps:** update support-deps ([#1425](https://github.com/defenseunicorns/uds-core/issues/1425)) ([9b6f681](https://github.com/defenseunicorns/uds-core/commit/9b6f6812042aa5345efc69c7242922c0014ae867))
* **deps:** update support-deps ([#1443](https://github.com/defenseunicorns/uds-core/issues/1443)) ([05def89](https://github.com/defenseunicorns/uds-core/commit/05def890049a4cb33e19634f93f08bed008cb09f))
* **deps:** update support-deps ([#1455](https://github.com/defenseunicorns/uds-core/issues/1455)) ([ccd72cf](https://github.com/defenseunicorns/uds-core/commit/ccd72cf1191a507887fe593d1c962f9af4fd0acd))
* **deps:** update vector ([#1444](https://github.com/defenseunicorns/uds-core/issues/1444)) ([d36014d](https://github.com/defenseunicorns/uds-core/commit/d36014ddbfcb90844e0bf984b3fa5ab8b0e33c96))
* **deps:** update velero to v8.7.1 ([#1391](https://github.com/defenseunicorns/uds-core/issues/1391)) ([ea4ed0f](https://github.com/defenseunicorns/uds-core/commit/ea4ed0fe7aa2282ed6aeec397432f14790461cb9))
* **docs:** fix order of authpols doc ([#1408](https://github.com/defenseunicorns/uds-core/issues/1408)) ([ee55ab1](https://github.com/defenseunicorns/uds-core/commit/ee55ab10091f1ef150bc1050b19ca8ec494deaa8))
* prefer `===` for comparisons ([#1412](https://github.com/defenseunicorns/uds-core/issues/1412)) ([6963633](https://github.com/defenseunicorns/uds-core/commit/696363385bfc569c79688364ad16d03aae852117))
* reduce sidecar cpu/memory requests for CI single-layer testing ([#1459](https://github.com/defenseunicorns/uds-core/issues/1459)) ([cc8c405](https://github.com/defenseunicorns/uds-core/commit/cc8c405af6ce2db0d98b3e9bded66904e9e550fd))
* remove watch and conditional logic around ambient component ([#1447](https://github.com/defenseunicorns/uds-core/issues/1447)) ([d519af3](https://github.com/defenseunicorns/uds-core/commit/d519af3d9f90980dfcaa90eed0ecf98cec089111))
* update changelog ([#1406](https://github.com/defenseunicorns/uds-core/issues/1406)) ([4239d95](https://github.com/defenseunicorns/uds-core/commit/4239d958744408d47c93021d4d5937b426d36db9))


### Documentation

* fix Velero doc link path ([#1456](https://github.com/defenseunicorns/uds-core/issues/1456)) ([01cea57](https://github.com/defenseunicorns/uds-core/commit/01cea5729d3e600e23f04ef131939e3f87983090))

## [0.39.0](https://github.com/defenseunicorns/uds-core/compare/v0.38.0...v0.39.0) (2025-04-01)


### ⚠ BREAKING CHANGES

* AuthService protection of pods is now absolute: ALL requests to a pod with authservice protection MUST have a jwt from Keycloak. More fine-grained protection can be done with additional `DENY` istio authorization policies, but there will always be a requirement for a Keycloak JWT in addition.

### Features

* add alertmanager datasource to grafana ([#1374](https://github.com/defenseunicorns/uds-core/issues/1374)) ([818a3a0](https://github.com/defenseunicorns/uds-core/commit/818a3a0967a689dfceeb9b494c11167fda3d09a5))
* ambient mesh authorization policy generation (https://github.com/defenseunicorns/uds-core/pull/1384) ([b47daba](https://github.com/defenseunicorns/uds-core/commit/b47dabaea78ee1a1089bbda59660b5a0a017114f))
* new webauth and mfa flows ([#1370](https://github.com/defenseunicorns/uds-core/issues/1370)) ([1ac1b03](https://github.com/defenseunicorns/uds-core/commit/1ac1b03b985feae924f0881c28ab11adba9aed33))
* theme customization ([#1382](https://github.com/defenseunicorns/uds-core/issues/1382)) ([55ef41b](https://github.com/defenseunicorns/uds-core/commit/55ef41b9fd9cf20b13699b6955ac99cd5bb9a9a0))
* use Client Credentials for managing Keycloak Clients ([#1341](https://github.com/defenseunicorns/uds-core/issues/1341)) ([4db9cc7](https://github.com/defenseunicorns/uds-core/commit/4db9cc75aac1473ebd9cffd772e7be39761fa2a6))


### Bug Fixes

* add delete credential keycloak secret value ([#1398](https://github.com/defenseunicorns/uds-core/issues/1398)) ([d45b3e6](https://github.com/defenseunicorns/uds-core/commit/d45b3e6c1a35caa638535ea8c6b9061136fd482c))
* broken selectors for internal dependencies on charts ([#1403](https://github.com/defenseunicorns/uds-core/issues/1403)) ([d72b194](https://github.com/defenseunicorns/uds-core/commit/d72b194b6fb68eb45411dc6c7b3e276241d23f6b))


### Miscellaneous

* add additionalNetworkAllow to keycloak and loki ([#1379](https://github.com/defenseunicorns/uds-core/issues/1379)) ([8200bce](https://github.com/defenseunicorns/uds-core/commit/8200bce42dfa0baf3349187a440d871eda20e3cd))
* add docs for layer selection ([#1216](https://github.com/defenseunicorns/uds-core/issues/1216)) ([c170322](https://github.com/defenseunicorns/uds-core/commit/c1703221b85d37451d60c226863a0b168e702e01))
* **deps:** update grafana ([#1383](https://github.com/defenseunicorns/uds-core/issues/1383)) ([122dc58](https://github.com/defenseunicorns/uds-core/commit/122dc584c97fb789b6664683811dc5d33f7714bc))
* **deps:** update grafana to v8.10.4 ([#1363](https://github.com/defenseunicorns/uds-core/issues/1363)) ([fb163bd](https://github.com/defenseunicorns/uds-core/commit/fb163bdf69b6b8a3d5d251a9e52bd512cc3e394e))
* **deps:** update istio to v1.25.0 ([#1335](https://github.com/defenseunicorns/uds-core/issues/1335)) ([1803ea7](https://github.com/defenseunicorns/uds-core/commit/1803ea7375100e61d2e06816e6c7150e0e4e76dc))
* **deps:** update keycloak to v0.11.1 ([#1400](https://github.com/defenseunicorns/uds-core/issues/1400)) ([6fdcd0c](https://github.com/defenseunicorns/uds-core/commit/6fdcd0c94e3aa9b86beab22e542cfb5334533b90))
* **deps:** update keycloak to v26.1.4 ([#1356](https://github.com/defenseunicorns/uds-core/issues/1356)) ([31152f7](https://github.com/defenseunicorns/uds-core/commit/31152f7659ef02335494d3a3646b49a4dd68398d))
* **deps:** update pepr to v0.46.3 ([#1365](https://github.com/defenseunicorns/uds-core/issues/1365)) ([304a556](https://github.com/defenseunicorns/uds-core/commit/304a556f7cec391cda0c8f6b330bad652d329a03))
* **deps:** update prometheus-stack ([#1362](https://github.com/defenseunicorns/uds-core/issues/1362)) ([ae40b27](https://github.com/defenseunicorns/uds-core/commit/ae40b27e38522749e7b8cd21702610307d2e182a))
* **deps:** update prometheus-stack ([#1380](https://github.com/defenseunicorns/uds-core/issues/1380)) ([eec3337](https://github.com/defenseunicorns/uds-core/commit/eec3337a61992a2eb50af54471c96f5d5d9c001e))
* **deps:** update support dependencies to v22.13.17 ([#1401](https://github.com/defenseunicorns/uds-core/issues/1401)) ([8a81eec](https://github.com/defenseunicorns/uds-core/commit/8a81eecbd007df466f9985e849587fbe78039bcd))
* **deps:** update support-deps ([#1364](https://github.com/defenseunicorns/uds-core/issues/1364)) ([7819bec](https://github.com/defenseunicorns/uds-core/commit/7819bec4b32d32fb29c8c59ffda22eb6705175c1))
* **deps:** update support-deps ([#1376](https://github.com/defenseunicorns/uds-core/issues/1376)) ([dd22589](https://github.com/defenseunicorns/uds-core/commit/dd22589fbe8e9ef44674ad09c2f4317c9a103759))
* **deps:** update support-deps ([#1390](https://github.com/defenseunicorns/uds-core/issues/1390)) ([f06bb70](https://github.com/defenseunicorns/uds-core/commit/f06bb7066a42e0dc298cac5164025a706255faec))
* **deps:** update support-deps ([#1392](https://github.com/defenseunicorns/uds-core/issues/1392)) ([c0762a3](https://github.com/defenseunicorns/uds-core/commit/c0762a3861e0acdef25ebe854eece8b3deaa6274))
* **deps:** update ts-jest to v29.3.0 ([#1377](https://github.com/defenseunicorns/uds-core/issues/1377)) ([8b2174a](https://github.com/defenseunicorns/uds-core/commit/8b2174a1e567a92f6b6f8ec3548e999fc4dee445))
* **deps:** update velero to v8.6.0 ([#1371](https://github.com/defenseunicorns/uds-core/issues/1371)) ([93a44e6](https://github.com/defenseunicorns/uds-core/commit/93a44e6d67b36f92c204d043484d996e877194ac))
* remove kiali and tempo references from repo ([#1375](https://github.com/defenseunicorns/uds-core/issues/1375)) ([8374de3](https://github.com/defenseunicorns/uds-core/commit/8374de3cbfccfffd6825ae59c18e6080f691346b))
* update how to scrape metrics ([#1378](https://github.com/defenseunicorns/uds-core/issues/1378)) ([e808f7d](https://github.com/defenseunicorns/uds-core/commit/e808f7d394ea4848c6203cc469960f82b89d0fa4))
* update unicorn ztunnel image to 1.25.0 ([#1389](https://github.com/defenseunicorns/uds-core/issues/1389)) ([7e446cb](https://github.com/defenseunicorns/uds-core/commit/7e446cbff939d144f964d41c55190626075f410a))


### Documentation

* velero csi vsphere backups ([#1385](https://github.com/defenseunicorns/uds-core/issues/1385)) ([5ae33b2](https://github.com/defenseunicorns/uds-core/commit/5ae33b2d01f308f5d7d067d30aa4b911d1c0d20e))

## [0.38.0](https://github.com/defenseunicorns/uds-core/compare/v0.37.0...v0.38.0) (2025-03-19)


### Features

* add status for removing / removalfailed ([#1334](https://github.com/defenseunicorns/uds-core/issues/1334)) ([a99b408](https://github.com/defenseunicorns/uds-core/commit/a99b4084c592a5b2177c56ad12ab62368e759ee4))
* document workaround for Keycloak and Apple M4 Macs ([#1337](https://github.com/defenseunicorns/uds-core/issues/1337)) ([ae51155](https://github.com/defenseunicorns/uds-core/commit/ae51155f304d2278be3d4ff8dc36ead3a1586128))
* root domain templating ([#1343](https://github.com/defenseunicorns/uds-core/issues/1343)) ([f64974c](https://github.com/defenseunicorns/uds-core/commit/f64974c4caf8927794f926bcdf6b71d7b8109520))
* sso doc restructure ([#1293](https://github.com/defenseunicorns/uds-core/issues/1293)) ([3c934a0](https://github.com/defenseunicorns/uds-core/commit/3c934a00435d1a1aae76a71c1093647f7940971c))


### Bug Fixes

* renovate not checking test directory versions ([#1357](https://github.com/defenseunicorns/uds-core/issues/1357)) ([9e78362](https://github.com/defenseunicorns/uds-core/commit/9e783621dac825e792ca1d34a331f4d1b64d0465))


### Miscellaneous

* **ci:** disable compliance checks ([#1347](https://github.com/defenseunicorns/uds-core/issues/1347)) ([e984131](https://github.com/defenseunicorns/uds-core/commit/e984131ebc68993f16f1a02b79f2d0be88c9ec16))
* **ci:** rm `create_bucket_lifecycle` input to s3 module calls ([#1348](https://github.com/defenseunicorns/uds-core/issues/1348)) ([c93aa7b](https://github.com/defenseunicorns/uds-core/commit/c93aa7b6404f33621e542f4c90a8553beea10c0f))
* **ci:** swap to govcloud for aws ci tests ([#1342](https://github.com/defenseunicorns/uds-core/issues/1342)) ([d51db55](https://github.com/defenseunicorns/uds-core/commit/d51db5599c1fae89a76c667abfa74c77cb94321b))
* **ci:** swap to new aws account for rke/eks tests ([#1339](https://github.com/defenseunicorns/uds-core/issues/1339)) ([3b6fb50](https://github.com/defenseunicorns/uds-core/commit/3b6fb50022e396f04a3c821a1aceb3ec2eb1c21b))
* **ci:** switch to local modules ([#1369](https://github.com/defenseunicorns/uds-core/issues/1369)) ([9f8536d](https://github.com/defenseunicorns/uds-core/commit/9f8536d76489c19dca5b0cee413a71aba58dadfd))
* **deps:** update grafana ([#1346](https://github.com/defenseunicorns/uds-core/issues/1346)) ([d869ca7](https://github.com/defenseunicorns/uds-core/commit/d869ca7b70419036010b237a4247a7798f9bc357))
* **deps:** update pepr to v0.46.1 ([#1336](https://github.com/defenseunicorns/uds-core/issues/1336)) ([5e9c119](https://github.com/defenseunicorns/uds-core/commit/5e9c1192c837981df1e418fdd1f7d639b867628c))
* **deps:** update pepr to v15.5.0 ([#1353](https://github.com/defenseunicorns/uds-core/issues/1353)) ([8d7b44b](https://github.com/defenseunicorns/uds-core/commit/8d7b44bce572bddab69c51232af96945fe78393d))
* **deps:** update prometheus-stack ([#1324](https://github.com/defenseunicorns/uds-core/issues/1324)) ([d6840be](https://github.com/defenseunicorns/uds-core/commit/d6840be9749cf9c1f1ce1e20b48548a7ed2bd0b3))
* **deps:** update support dependencies to v0.24.0 ([#1360](https://github.com/defenseunicorns/uds-core/issues/1360)) ([bf23651](https://github.com/defenseunicorns/uds-core/commit/bf2365153d49ebf93fda4d7e766bc3740998dd90))
* **deps:** update support dependencies to v4.1.5 ([#1340](https://github.com/defenseunicorns/uds-core/issues/1340)) ([0714b05](https://github.com/defenseunicorns/uds-core/commit/0714b0554d05247a61f722a36d80687b4da294aa))
* **deps:** update support dependencies to v4.23.0 ([#1358](https://github.com/defenseunicorns/uds-core/issues/1358)) ([e6a986e](https://github.com/defenseunicorns/uds-core/commit/e6a986e291b11ac07fc6c2663cc8c1339f7d8805))
* **deps:** update support-deps ([#1332](https://github.com/defenseunicorns/uds-core/issues/1332)) ([e37d062](https://github.com/defenseunicorns/uds-core/commit/e37d0623a5c65cd79d3199f43c75ef44003720b5))
* **deps:** update support-deps ([#1345](https://github.com/defenseunicorns/uds-core/issues/1345)) ([e390899](https://github.com/defenseunicorns/uds-core/commit/e3908999ff31e4973324c362566e01e91ef55623))
* **deps:** update support-deps ([#1351](https://github.com/defenseunicorns/uds-core/issues/1351)) ([551a865](https://github.com/defenseunicorns/uds-core/commit/551a86504295ff4828576bcfdd543d93a81a6925))
* **deps:** update support-deps ([#1354](https://github.com/defenseunicorns/uds-core/issues/1354)) ([dd36d03](https://github.com/defenseunicorns/uds-core/commit/dd36d0353ea8373ce2a5ddc173a9b2c83fcf35b1))
* **deps:** update velero ([#1299](https://github.com/defenseunicorns/uds-core/issues/1299)) ([59ce747](https://github.com/defenseunicorns/uds-core/commit/59ce747ddef860911403260c39ba1ae1ed29fbdf))
* **docs:** keycloak session timeout doc ([#1315](https://github.com/defenseunicorns/uds-core/issues/1315)) ([9509ac7](https://github.com/defenseunicorns/uds-core/commit/9509ac7119181056314cd956fc8db192a7fb819d))


### Documentation

* add developer doc on ci testing ([#1344](https://github.com/defenseunicorns/uds-core/issues/1344)) ([0e011a4](https://github.com/defenseunicorns/uds-core/commit/0e011a4915101f6dbc74b3c3e2ba27bd2fc57364))

## [0.37.0](https://github.com/defenseunicorns/uds-core/compare/v0.36.2...v0.37.0) (2025-03-03)


### Features

* kstatus for Pepr ([#1288](https://github.com/defenseunicorns/uds-core/issues/1288)) ([c1b78d2](https://github.com/defenseunicorns/uds-core/commit/c1b78d2ac9f8415526b9289fec4e578d01b17298))
* new bundle variable - KEYCLOAK_HEAP_OPTIONS ([#1314](https://github.com/defenseunicorns/uds-core/issues/1314)) ([f7e0ebb](https://github.com/defenseunicorns/uds-core/commit/f7e0ebb476ef524ba3773d1c5f2bde8c28b7d8ea))


### Miscellaneous

* **deps:** update grafana ([#1285](https://github.com/defenseunicorns/uds-core/issues/1285)) ([ffda059](https://github.com/defenseunicorns/uds-core/commit/ffda05948b772601b22d6cffd1f379f681320629))
* **deps:** update jest to v29.2.6 ([#1313](https://github.com/defenseunicorns/uds-core/issues/1313)) ([d30c6c7](https://github.com/defenseunicorns/uds-core/commit/d30c6c79b183bf2a9696780431d2e0ff27792b91))
* **deps:** update keycloak to v26.1.3 ([#1326](https://github.com/defenseunicorns/uds-core/issues/1326)) ([691eebe](https://github.com/defenseunicorns/uds-core/commit/691eebe3eeb448c40a5065f2570585ddb0a2a213))
* **deps:** update loki ([#1272](https://github.com/defenseunicorns/uds-core/issues/1272)) ([54b2cfc](https://github.com/defenseunicorns/uds-core/commit/54b2cfc44d5649c407de11f20f59ef9efd276302))
* **deps:** update prometheus to 3.2.0, prometheus-operator to 0.80.1 ([#1262](https://github.com/defenseunicorns/uds-core/issues/1262)) ([d1c6c3c](https://github.com/defenseunicorns/uds-core/commit/d1c6c3c8d7f8659b20d21653782fda0ed9be4c31))
* **deps:** update prometheus to v3.2.1 ([#1321](https://github.com/defenseunicorns/uds-core/issues/1321)) ([e1ee576](https://github.com/defenseunicorns/uds-core/commit/e1ee576bf465c19d67848759ba7cdeddcc0be0eb))
* **deps:** update support-deps ([#1289](https://github.com/defenseunicorns/uds-core/issues/1289)) ([73f5de2](https://github.com/defenseunicorns/uds-core/commit/73f5de28c3cde2b65dfcba58b7f167c9d941aacc))
* **deps:** update support-deps ([#1323](https://github.com/defenseunicorns/uds-core/issues/1323)) ([2822097](https://github.com/defenseunicorns/uds-core/commit/28220972fba6d27158d468239a2859b7cadadf50))
* **deps:** update vector to 0.45.0 ([#1316](https://github.com/defenseunicorns/uds-core/issues/1316)) ([c66e807](https://github.com/defenseunicorns/uds-core/commit/c66e807eeb6b9c1bbe683a18cd647fb1f195a364))
* enable ambient component for rke2/aks ci ([#1322](https://github.com/defenseunicorns/uds-core/issues/1322)) ([c280b03](https://github.com/defenseunicorns/uds-core/commit/c280b03fa9153b0345d00e74c2385e57db21df57))
* switch to azure gov account ([#1318](https://github.com/defenseunicorns/uds-core/issues/1318)) ([31ec997](https://github.com/defenseunicorns/uds-core/commit/31ec997156305db90538169093a77bcf69e64a89))

## [0.36.2](https://github.com/defenseunicorns/uds-core/compare/v0.36.1...v0.36.2) (2025-02-21)


### Miscellaneous

* **deps:** update keycloak to v0.10.2 ([#1311](https://github.com/defenseunicorns/uds-core/issues/1311)) ([6c1b5b7](https://github.com/defenseunicorns/uds-core/commit/6c1b5b74894feaa5b1c0f3a8c7dfa87a59eb9a77))
* **deps:** update pepr to v0.46.0 ([#1304](https://github.com/defenseunicorns/uds-core/issues/1304)) ([4d0b9d0](https://github.com/defenseunicorns/uds-core/commit/4d0b9d0497e76793ff7de18a4ab7fe2bdfbfc747))

## [0.36.1](https://github.com/defenseunicorns/uds-core/compare/v0.36.0...v0.36.1) (2025-02-19)


### Bug Fixes

* add `package: read` permissions for nightly ci workflows ([#1306](https://github.com/defenseunicorns/uds-core/issues/1306)) ([7b62133](https://github.com/defenseunicorns/uds-core/commit/7b6213398f0c18e02a4e6e4646b09998ded5064f))
* checkpoint package creation ([#1303](https://github.com/defenseunicorns/uds-core/issues/1303)) ([fabd56b](https://github.com/defenseunicorns/uds-core/commit/fabd56bb6e5dd14f0d5719d7b087a9ba77b1678e))


### Miscellaneous

* **deps:** update pepr to v0.45.1 ([#1297](https://github.com/defenseunicorns/uds-core/issues/1297)) ([4ddc821](https://github.com/defenseunicorns/uds-core/commit/4ddc821d949d85577d4b18a5679379fc50d7a3c7))
* **docs:** docs update ([#1300](https://github.com/defenseunicorns/uds-core/issues/1300)) ([f266d36](https://github.com/defenseunicorns/uds-core/commit/f266d3630d4d14701414627f66287c8ef2dea3e5))

## [0.36.0](https://github.com/defenseunicorns/uds-core/compare/v0.35.0...v0.36.0) (2025-02-18)


### Features

* introduced a new option CREATE_OPTIONS and skip SBOMs in tests ([#1268](https://github.com/defenseunicorns/uds-core/issues/1268)) ([f944bf1](https://github.com/defenseunicorns/uds-core/commit/f944bf1a31839203b0738ea4c8b732a4ba94a7cb))
* **k3d-slim-dev:** add Istio Proxy resource configuration ([#1270](https://github.com/defenseunicorns/uds-core/issues/1270)) ([fd4fa3c](https://github.com/defenseunicorns/uds-core/commit/fd4fa3c95cc378de862332cccd6f7b6e8b985ee6))
* **k3d-slim-dev:** add resource configuration for Istiod and Keycloak ([#1279](https://github.com/defenseunicorns/uds-core/issues/1279)) ([07eeea2](https://github.com/defenseunicorns/uds-core/commit/07eeea29d2b1908404a167d2ec36bd85db92659a))
* loki schema config management ([#1224](https://github.com/defenseunicorns/uds-core/issues/1224)) ([e16fdb1](https://github.com/defenseunicorns/uds-core/commit/e16fdb1aae606e75e865100951480e27806db34a))


### Bug Fixes

* add Keycloak workaround for Kernels 6.12+ ([#1218](https://github.com/defenseunicorns/uds-core/issues/1218)) ([bb634a6](https://github.com/defenseunicorns/uds-core/commit/bb634a6e908ed127084ddd972917455501ec9fa4))
* added network restriction tests ([#1250](https://github.com/defenseunicorns/uds-core/issues/1250)) ([9ef6c2b](https://github.com/defenseunicorns/uds-core/commit/9ef6c2b03b58eaf7cefe4c723f64c12c56d1f620))
* always upload CVE report ([#1286](https://github.com/defenseunicorns/uds-core/issues/1286)) ([e97b6b9](https://github.com/defenseunicorns/uds-core/commit/e97b6b91f1d759a9b386be396cb2674ce8fc52da))
* image name parsing for cve scan ([#1294](https://github.com/defenseunicorns/uds-core/issues/1294)) ([7f3b53b](https://github.com/defenseunicorns/uds-core/commit/7f3b53b1d6372aef293fd5628958084fdd63c6fc))
* lint errors on unused caught errors ([#1271](https://github.com/defenseunicorns/uds-core/issues/1271)) ([ccd824e](https://github.com/defenseunicorns/uds-core/commit/ccd824ebafd61192a4e0f88ebad9291af63a0c0e))


### Miscellaneous

* add json schema generation ([#1264](https://github.com/defenseunicorns/uds-core/issues/1264)) ([9eee462](https://github.com/defenseunicorns/uds-core/commit/9eee462efa19985326f776395bb02782927e38a9))
* **ci:** add workflow for scanning unicorn core for CVEs ([#1274](https://github.com/defenseunicorns/uds-core/issues/1274)) ([d7226be](https://github.com/defenseunicorns/uds-core/commit/d7226be09b049f34ab39fb078bbc2798f08e3e13))
* **deps:** remove keycloak registry1 flavor architecture restriction ([#1267](https://github.com/defenseunicorns/uds-core/issues/1267)) ([c50b081](https://github.com/defenseunicorns/uds-core/commit/c50b081b6c47abc48ff76bab12ea4e2ac81bb9df))
* **deps:** update grafana ([#1242](https://github.com/defenseunicorns/uds-core/issues/1242)) ([73331d4](https://github.com/defenseunicorns/uds-core/commit/73331d43509d0c7d2775f87e5ecf341da571fce0))
* **deps:** update grafana to v8.12.1 ([#1276](https://github.com/defenseunicorns/uds-core/issues/1276)) ([ca60ca5](https://github.com/defenseunicorns/uds-core/commit/ca60ca5658420f3fa541ff4d5db8f9eced551402))
* **deps:** update istio to v1.24.3 ([#1266](https://github.com/defenseunicorns/uds-core/issues/1266)) ([27acb5d](https://github.com/defenseunicorns/uds-core/commit/27acb5df8781876e57947c115dd7bc36f4e9ceba))
* **deps:** update keycloak ([#1184](https://github.com/defenseunicorns/uds-core/issues/1184)) ([71fd910](https://github.com/defenseunicorns/uds-core/commit/71fd910ec87420ddc6355b72b7e0e7528b613c1a))
* **deps:** update keycloak to v0.10.1 ([#1298](https://github.com/defenseunicorns/uds-core/issues/1298)) ([e552e24](https://github.com/defenseunicorns/uds-core/commit/e552e241645a190304aee09ba315cd6d992e50af))
* **deps:** update keycloak to v26.1.1 ([#1258](https://github.com/defenseunicorns/uds-core/issues/1258)) ([f3a3731](https://github.com/defenseunicorns/uds-core/commit/f3a37317db04ed47c29ebf9d7c1eedd9914cabd6))
* **deps:** update keycloak to v26.1.2 ([#1269](https://github.com/defenseunicorns/uds-core/issues/1269)) ([3301bab](https://github.com/defenseunicorns/uds-core/commit/3301baba56af647ca6948be6e403a6e7a9a44ad8))
* **deps:** update loki ([#1202](https://github.com/defenseunicorns/uds-core/issues/1202)) ([79f8209](https://github.com/defenseunicorns/uds-core/commit/79f8209e5dea5bd78e083b5fd8401b2c87f38289))
* **deps:** update neuvector registry1 scanner and unicorn updater ([#1261](https://github.com/defenseunicorns/uds-core/issues/1261)) ([8b4ed68](https://github.com/defenseunicorns/uds-core/commit/8b4ed6851d0899662f3fc0f0fc5b0c7333066529))
* **deps:** update neuvector updater image for unicorn flavor to v8.12.1 ([#1284](https://github.com/defenseunicorns/uds-core/issues/1284)) ([8c7bb17](https://github.com/defenseunicorns/uds-core/commit/8c7bb172146623aed0b6e7a42fd70180fb62fb08))
* **deps:** update pepr to v0.45.0 ([#1252](https://github.com/defenseunicorns/uds-core/issues/1252)) ([8be12db](https://github.com/defenseunicorns/uds-core/commit/8be12db875db380066721ff085b1c6df479afdeb))
* **deps:** update prometheus-stack ([#1255](https://github.com/defenseunicorns/uds-core/issues/1255)) ([1a316a2](https://github.com/defenseunicorns/uds-core/commit/1a316a27b7142d022027a7ed896c47ccb02ea117))
* **deps:** update prometheus-stack to v68.4.4 ([#1244](https://github.com/defenseunicorns/uds-core/issues/1244)) ([8053443](https://github.com/defenseunicorns/uds-core/commit/805344398b3ee4b1565a1440c3788e44a8980238))
* **deps:** update support-deps ([#1251](https://github.com/defenseunicorns/uds-core/issues/1251)) ([30db8f0](https://github.com/defenseunicorns/uds-core/commit/30db8f0c065c46cb19fd7e20acaa216aba5a739e))
* **deps:** update support-deps ([#1260](https://github.com/defenseunicorns/uds-core/issues/1260)) ([e0e2523](https://github.com/defenseunicorns/uds-core/commit/e0e25239e99a1afb4c7c2cea4fededcdc4cdb884))
* **deps:** update support-deps ([#1275](https://github.com/defenseunicorns/uds-core/issues/1275)) ([069a201](https://github.com/defenseunicorns/uds-core/commit/069a2017897b16b05c975cf2a11f154661609744))
* **deps:** update uds-identity-config image ([#1278](https://github.com/defenseunicorns/uds-core/issues/1278)) ([3325662](https://github.com/defenseunicorns/uds-core/commit/3325662ff935fef15730c03273590a16f6f9955d))
* **deps:** update velero to v1.32.2 ([#1277](https://github.com/defenseunicorns/uds-core/issues/1277)) ([02db070](https://github.com/defenseunicorns/uds-core/commit/02db070bc3197b70af5e07c18cf9df42119ad9f5))
* switch to registry1 cni image ([#1256](https://github.com/defenseunicorns/uds-core/issues/1256)) ([2b564e6](https://github.com/defenseunicorns/uds-core/commit/2b564e6ac2dc70928bfa557b1c434a002f359d19))

## [0.35.0](https://github.com/defenseunicorns/uds-core/compare/v0.34.1...v0.35.0) (2025-02-03)


### Features

* add logic to handle updates to operator config ([#1186](https://github.com/defenseunicorns/uds-core/issues/1186)) ([004e8b4](https://github.com/defenseunicorns/uds-core/commit/004e8b4114a46869488e7412d6f2d7201f83acd3))
* optional istio cni ztunnel component ([#1175](https://github.com/defenseunicorns/uds-core/issues/1175)) ([e003924](https://github.com/defenseunicorns/uds-core/commit/e00392484e9d43ee2d33be531ed11e8836b5b545))


### Bug Fixes

* add healthz port to neuvector services ([#1223](https://github.com/defenseunicorns/uds-core/issues/1223)) ([ec55729](https://github.com/defenseunicorns/uds-core/commit/ec55729692c753f1ec983d3ea38fb627ca9557e1))
* add patch for adding nv enforcer readiness probe ([#1239](https://github.com/defenseunicorns/uds-core/issues/1239)) ([098ef3d](https://github.com/defenseunicorns/uds-core/commit/098ef3df502bbebf3ec3c57d6f3fede825877540))
* address AKS ci flakiness ([#1238](https://github.com/defenseunicorns/uds-core/issues/1238)) ([262ba3e](https://github.com/defenseunicorns/uds-core/commit/262ba3edc07dfd398b11838dc167786378bcab36))
* checkpoint ci issue ([#1234](https://github.com/defenseunicorns/uds-core/issues/1234)) ([548ff6a](https://github.com/defenseunicorns/uds-core/commit/548ff6af3eec1a2c03438bfdf9e2f9301997aefb))
* denied user permissions policy messaging ([#1227](https://github.com/defenseunicorns/uds-core/issues/1227)) ([1ccf4f7](https://github.com/defenseunicorns/uds-core/commit/1ccf4f7bce2cc09a74a2bb5e28a894900440d4a7))
* istio package no longer assumes pepr deployments exist ([#1232](https://github.com/defenseunicorns/uds-core/issues/1232)) ([ab11592](https://github.com/defenseunicorns/uds-core/commit/ab115926cf07a5c0bfe52d25df0791cd99d9d78e))


### Miscellaneous

* **ci:** disable rds parameter group creation ([#1230](https://github.com/defenseunicorns/uds-core/issues/1230)) ([b4cb499](https://github.com/defenseunicorns/uds-core/commit/b4cb49946096acacda544a953960740494664dd1))
* **deps:** update authservice to v1.0.4 ([#1211](https://github.com/defenseunicorns/uds-core/issues/1211)) ([da4d043](https://github.com/defenseunicorns/uds-core/commit/da4d043b56cd7aa746838f432da8e7501469f1d7))
* **deps:** update grafana ([#1213](https://github.com/defenseunicorns/uds-core/issues/1213)) ([54ddd23](https://github.com/defenseunicorns/uds-core/commit/54ddd2329ee3812f797588d644b9f099186a0357))
* **deps:** update pepr ([#1197](https://github.com/defenseunicorns/uds-core/issues/1197)) ([652c925](https://github.com/defenseunicorns/uds-core/commit/652c925629a89408fd69f46b9933a8bc4bc15bc9))
* **deps:** update prometheus-stack ([#1189](https://github.com/defenseunicorns/uds-core/issues/1189)) ([e02c14c](https://github.com/defenseunicorns/uds-core/commit/e02c14c5a77260021510873b318bca4b1bf9ad3c))
* **deps:** update support-deps ([#1204](https://github.com/defenseunicorns/uds-core/issues/1204)) ([d477f6a](https://github.com/defenseunicorns/uds-core/commit/d477f6a0cccaaa15939e59df20cf1f7abc888f08))
* **deps:** update support-deps ([#1243](https://github.com/defenseunicorns/uds-core/issues/1243)) ([d4179ae](https://github.com/defenseunicorns/uds-core/commit/d4179ae3dd8555b08c6866f7e1aedacf47811246))
* **deps:** update support-deps to v1.50.1 ([#1241](https://github.com/defenseunicorns/uds-core/issues/1241)) ([6c14208](https://github.com/defenseunicorns/uds-core/commit/6c1420875d3e91d665e6f375c0c712fcf896bc55))
* **docs:** cleanup diagrams ([#1246](https://github.com/defenseunicorns/uds-core/issues/1246)) ([f6bffb9](https://github.com/defenseunicorns/uds-core/commit/f6bffb9aae7d5439d57b85ec9c96af0d1c7b0caf))
* **main:** release 0.35.0 ([#1219](https://github.com/defenseunicorns/uds-core/issues/1219)) ([c31c608](https://github.com/defenseunicorns/uds-core/commit/c31c60881f8f00c08aadf12fb8f6a0d2373ea8ad))
* switch registry1 ztunnel to proper source ([#1249](https://github.com/defenseunicorns/uds-core/issues/1249)) ([defa586](https://github.com/defenseunicorns/uds-core/commit/defa586defac4b18fb2e9f09f18c50258322e12f))
* switch unicorn ztunnel to fips image ([#1240](https://github.com/defenseunicorns/uds-core/issues/1240)) ([dd63ac6](https://github.com/defenseunicorns/uds-core/commit/dd63ac6457e525e1f3794e7539a272780f8ae561))


### Documentation

* add documentation on metrics/dashboards for apps ([#1221](https://github.com/defenseunicorns/uds-core/issues/1221)) ([d9062da](https://github.com/defenseunicorns/uds-core/commit/d9062da0e653a9148c60c8be9a30a88095038737))

## [0.34.1](https://github.com/defenseunicorns/uds-core/compare/v0.34.0...v0.34.1) (2025-01-21)


### Bug Fixes

* broken links ([#1210](https://github.com/defenseunicorns/uds-core/issues/1210)) ([9cc00e6](https://github.com/defenseunicorns/uds-core/commit/9cc00e60e08aaf9dd07bd3cd13d470b8029b2394))
* disable snapshot before deletion of rds instances in eks ci ([#1190](https://github.com/defenseunicorns/uds-core/issues/1190)) ([3cbd51c](https://github.com/defenseunicorns/uds-core/commit/3cbd51c7b8564e72402b30c6b823769f90a959b2))


### Miscellaneous

* **deps:** update grafana to v8.8.3 ([#1195](https://github.com/defenseunicorns/uds-core/issues/1195)) ([cd22e06](https://github.com/defenseunicorns/uds-core/commit/cd22e064a2436026c7ff38757025e21f2923f078))
* **deps:** update grafana to v8.8.4 ([#1206](https://github.com/defenseunicorns/uds-core/issues/1206)) ([00e89ff](https://github.com/defenseunicorns/uds-core/commit/00e89fff586f1eb007d5c75b38d090f52b4410ef))
* **deps:** update neuvector ([#1196](https://github.com/defenseunicorns/uds-core/issues/1196)) ([5e7091e](https://github.com/defenseunicorns/uds-core/commit/5e7091ef21732de83902b233c5f6574aafa949ed))
* **deps:** update support-deps ([#1192](https://github.com/defenseunicorns/uds-core/issues/1192)) ([5731713](https://github.com/defenseunicorns/uds-core/commit/5731713c53c846796c0153193ffc49d295b6d110))
* **deps:** update velero to 1.15.2 (https://github.com/defenseunicorns/uds-core/pull/1183) ([d1bbc46](https://github.com/defenseunicorns/uds-core/commit/d1bbc46d7a8508ddc3ad3cee5ae09472352b5d78))
* **docs:** uds operator diagrams ([#1179](https://github.com/defenseunicorns/uds-core/issues/1179)) ([9b418a8](https://github.com/defenseunicorns/uds-core/commit/9b418a87783b1f7b194f113b61955787e22ad6a7))
* **docs:** update existing diagrams ([#1187](https://github.com/defenseunicorns/uds-core/issues/1187)) ([6f0fda2](https://github.com/defenseunicorns/uds-core/commit/6f0fda2360df80f1de27d56c7c656d64c9dca419))
* ignore uds-docs on commit linting ([#1194](https://github.com/defenseunicorns/uds-core/issues/1194)) ([789f101](https://github.com/defenseunicorns/uds-core/commit/789f101e079783f07c4027953f6d699b1c4fa584))
* troubleshooting docs ([#1205](https://github.com/defenseunicorns/uds-core/issues/1205)) ([3688bc7](https://github.com/defenseunicorns/uds-core/commit/3688bc7be6f2345d34c1bf4d014c0261836c364a))


### Documentation

* add irsa config ([#1203](https://github.com/defenseunicorns/uds-core/issues/1203)) ([3567056](https://github.com/defenseunicorns/uds-core/commit/3567056c24f84f25551e46aaae791faa1cf404e3))

## [0.34.0](https://github.com/defenseunicorns/uds-core/compare/v0.33.1...v0.34.0) (2025-01-15)


### Features

* add additional outputs to `debug-output` action ([#1073](https://github.com/defenseunicorns/uds-core/issues/1073)) ([29f12b4](https://github.com/defenseunicorns/uds-core/commit/29f12b4ff2aee2678d76521887384ce46746782a))
* istio native sidecars ([#1032](https://github.com/defenseunicorns/uds-core/issues/1032)) ([e07c6dc](https://github.com/defenseunicorns/uds-core/commit/e07c6dcc6bf135e5fb87866a1d10c49c08cc3eae))


### Bug Fixes

* add missing resource type `package` to `kubectl describe` failed… ([#1182](https://github.com/defenseunicorns/uds-core/issues/1182)) ([4236b3a](https://github.com/defenseunicorns/uds-core/commit/4236b3a6856783da627b5344e89d1fdde34c2aeb))
* attempt fix token permissions ([#1155](https://github.com/defenseunicorns/uds-core/issues/1155)) ([5a46e41](https://github.com/defenseunicorns/uds-core/commit/5a46e41e5bdce486c800654822232e2af9f3af94))
* remove unnecessary docker command in dev docs task ([#1180](https://github.com/defenseunicorns/uds-core/issues/1180)) ([9906a09](https://github.com/defenseunicorns/uds-core/commit/9906a09fa9752be6afbc52e63c601ce70f90e8c2))
* validate unique names for monitors ([#666](https://github.com/defenseunicorns/uds-core/issues/666)) ([80e28c1](https://github.com/defenseunicorns/uds-core/commit/80e28c17769e2bd93e6f42d9ce4fd7a29106e7ee))


### Miscellaneous

* add base url field for sso clients ([#1177](https://github.com/defenseunicorns/uds-core/issues/1177)) ([39bef00](https://github.com/defenseunicorns/uds-core/commit/39bef00aa8aefea184b5f842a40bf20bb814874b))
* add dev task for docs site ([#1173](https://github.com/defenseunicorns/uds-core/issues/1173)) ([b0c4bc0](https://github.com/defenseunicorns/uds-core/commit/b0c4bc0c9473c321287c9512032df7800fee9374))
* **deps:** bump cross-spawn from 7.0.3 to 7.0.6 ([#1157](https://github.com/defenseunicorns/uds-core/issues/1157)) ([11ddada](https://github.com/defenseunicorns/uds-core/commit/11ddadad108eb25b249c36765f1a53f1e16eb53b))
* **deps:** update grafana to v1.29.0 ([#1167](https://github.com/defenseunicorns/uds-core/issues/1167)) ([3b31358](https://github.com/defenseunicorns/uds-core/commit/3b3135888b30ed6d7b8b2834a59c0a02b57b78fc))
* **deps:** update istio to v1.24.2 ([#1135](https://github.com/defenseunicorns/uds-core/issues/1135)) ([0f9552a](https://github.com/defenseunicorns/uds-core/commit/0f9552a0f4d9b3ed230f497c6738b5686d04669e))
* **deps:** update keycloak to v26.0.8 ([#1171](https://github.com/defenseunicorns/uds-core/issues/1171)) ([1346f7b](https://github.com/defenseunicorns/uds-core/commit/1346f7bd02158970a76b393e935ebbde4855791c))
* **deps:** update loki memcached to v1.6.34 ([#1148](https://github.com/defenseunicorns/uds-core/issues/1148)) ([8bbf6b3](https://github.com/defenseunicorns/uds-core/commit/8bbf6b3d973b28d5d2edd044baf2ae8ae2d0cd20))
* **deps:** update pepr to v0.42.3 ([#1158](https://github.com/defenseunicorns/uds-core/issues/1158)) ([55e8a4e](https://github.com/defenseunicorns/uds-core/commit/55e8a4eb2e0fd5bc5a27f7b25921a39a20e08ff1))
* **deps:** update pepr to v15.3.0 ([#1151](https://github.com/defenseunicorns/uds-core/issues/1151)) ([153b7e1](https://github.com/defenseunicorns/uds-core/commit/153b7e1739b1d68fefd1a635843ed27c4a1af8fe))
* **deps:** update prometheus-stack ([#1137](https://github.com/defenseunicorns/uds-core/issues/1137)) ([8dc0781](https://github.com/defenseunicorns/uds-core/commit/8dc0781023e8629e9a4eb22c4a406d418e9ae6ae))
* **deps:** update prometheus-stack ([#1169](https://github.com/defenseunicorns/uds-core/issues/1169)) ([71cab01](https://github.com/defenseunicorns/uds-core/commit/71cab011d66d5c46e1ee76644dfe9c4f23a05f1d))
* **deps:** update prometheus-stack to v67.9.0 ([#1161](https://github.com/defenseunicorns/uds-core/issues/1161)) ([067df1b](https://github.com/defenseunicorns/uds-core/commit/067df1bf79c97ca6bd78f9998f7e51e1cac0fc7a))
* **deps:** update prometheus-stack to v68.1.0 ([#1176](https://github.com/defenseunicorns/uds-core/issues/1176)) ([7088e78](https://github.com/defenseunicorns/uds-core/commit/7088e78a14106ba1cf1d34eb182fc2e191bd9ead))
* **deps:** update support-deps ([#1147](https://github.com/defenseunicorns/uds-core/issues/1147)) ([cf1a60b](https://github.com/defenseunicorns/uds-core/commit/cf1a60b7d8d81a7936d102cb67414c48aae3a953))
* **deps:** update support-deps ([#1160](https://github.com/defenseunicorns/uds-core/issues/1160)) ([6c55f6b](https://github.com/defenseunicorns/uds-core/commit/6c55f6bcc8aa6ac9cd1a72cb11492bd6a9d8baea))
* **deps:** update vector ([#1165](https://github.com/defenseunicorns/uds-core/issues/1165)) ([abb9584](https://github.com/defenseunicorns/uds-core/commit/abb9584d44249ecb94ef4b808b58d30ecd97dde5))
* **deps:** update velero ([#1150](https://github.com/defenseunicorns/uds-core/issues/1150)) ([29ee12b](https://github.com/defenseunicorns/uds-core/commit/29ee12bba57f4c75e195cbb66a89477ef3d49c7e))
* docs update issue template ([#1163](https://github.com/defenseunicorns/uds-core/issues/1163)) ([21486f9](https://github.com/defenseunicorns/uds-core/commit/21486f9c1ae6e638f94854685d85907160709348))
* **docs:** add doc on non-http ingress ([#1166](https://github.com/defenseunicorns/uds-core/issues/1166)) ([0783525](https://github.com/defenseunicorns/uds-core/commit/0783525b98a05a8d5ffed1cf5bed16bb7887d724))
* **docs:** change .md link format to adhere to checker ([#1181](https://github.com/defenseunicorns/uds-core/issues/1181)) ([125a03b](https://github.com/defenseunicorns/uds-core/commit/125a03b09d9d65a51cbe8890a1add07999aefb34))
* **docs:** update Flavor Specific Development Notes ([#1153](https://github.com/defenseunicorns/uds-core/issues/1153)) ([bba5a71](https://github.com/defenseunicorns/uds-core/commit/bba5a710f1b9f8bf92039f00a382a28578846727))


### Documentation

* add note on minimum k3d version, update cli version reference ([#1174](https://github.com/defenseunicorns/uds-core/issues/1174)) ([c4dda4e](https://github.com/defenseunicorns/uds-core/commit/c4dda4e9d34ee5d8a802ea65027404400abde615))

## [0.33.1](https://github.com/defenseunicorns/uds-core/compare/v0.33.0...v0.33.1) (2024-12-20)


### Bug Fixes

* add generated target for all node IPs ([#1119](https://github.com/defenseunicorns/uds-core/issues/1119)) ([033338b](https://github.com/defenseunicorns/uds-core/commit/033338b21b9fa336f44aebd2271188d330c2c75a))


### Miscellaneous

* add action to check readiness on renovate PRs before running CI ([#1144](https://github.com/defenseunicorns/uds-core/issues/1144)) ([83d81c6](https://github.com/defenseunicorns/uds-core/commit/83d81c68209aa6ca51ff02ce8d2ba127df24aac5))
* **deps:** update codeql action to v3.28.0 ([#1146](https://github.com/defenseunicorns/uds-core/issues/1146)) ([fe9bccf](https://github.com/defenseunicorns/uds-core/commit/fe9bccfacce0faa5d384fa151347fbd354c28008))
* **deps:** update k8s-sidecar to v1.28.4 ([#1132](https://github.com/defenseunicorns/uds-core/issues/1132)) ([b4f15ff](https://github.com/defenseunicorns/uds-core/commit/b4f15ff6e4931059c0724f5937c8b6e7b8c9b3ba))
* **deps:** update loki ([#1134](https://github.com/defenseunicorns/uds-core/issues/1134)) ([56d0e39](https://github.com/defenseunicorns/uds-core/commit/56d0e3935f4f0e5a76998640c42df634f1840ab3))
* **deps:** update prometheus-stack (prometheus 3.0.1, operator 0.79.2) ([#949](https://github.com/defenseunicorns/uds-core/issues/949)) ([5a35fc6](https://github.com/defenseunicorns/uds-core/commit/5a35fc61dc8a1f2b05913e387576358da728d614))
* **deps:** update support-deps ([#1131](https://github.com/defenseunicorns/uds-core/issues/1131)) ([4853969](https://github.com/defenseunicorns/uds-core/commit/48539691a9ed5863896b47e461fa1b32d50d4659))
* **deps:** update support-deps ([#1138](https://github.com/defenseunicorns/uds-core/issues/1138)) ([2764d03](https://github.com/defenseunicorns/uds-core/commit/2764d03d8c2bae1ac1d292aa3ac31f8c3e2cbe94))

## [0.33.0](https://github.com/defenseunicorns/uds-core/compare/v0.32.1...v0.33.0) (2024-12-17)


### Features

* configurable authentication flows ([#1102](https://github.com/defenseunicorns/uds-core/issues/1102)) ([498574c](https://github.com/defenseunicorns/uds-core/commit/498574c0a41b50afc2ecaa36225c412c03ed6ed1))
* experimental opt-in classification banner ([#1127](https://github.com/defenseunicorns/uds-core/issues/1127)) ([d701067](https://github.com/defenseunicorns/uds-core/commit/d7010678d8ce6b3f966f0e4b7b5e027f62eb31bc))
* set Istio gateway TLS from Kubernetes secret ([#982](https://github.com/defenseunicorns/uds-core/issues/982)) ([2711209](https://github.com/defenseunicorns/uds-core/commit/27112092e08f67ae4d414c94beaa86e163e307bd))


### Bug Fixes

* kubeapi netpol initialization / support for ingress policies ([#1097](https://github.com/defenseunicorns/uds-core/issues/1097)) ([620e6b2](https://github.com/defenseunicorns/uds-core/commit/620e6b2c98a1a810995f4431578b6c2a71479db9))
* retry logic for pepr store call ([#1109](https://github.com/defenseunicorns/uds-core/issues/1109)) ([e4c0f61](https://github.com/defenseunicorns/uds-core/commit/e4c0f6147f17ba20a87e95099b92fcf79e74ca3e))


### Miscellaneous

* add additional step to pr request template ([#1104](https://github.com/defenseunicorns/uds-core/issues/1104)) ([7370ab1](https://github.com/defenseunicorns/uds-core/commit/7370ab1289095d8d718c6c7517c82642dbf4db56))
* allow separate configuration of admin domain name ([#1114](https://github.com/defenseunicorns/uds-core/issues/1114)) ([c331ec1](https://github.com/defenseunicorns/uds-core/commit/c331ec11071c5618589d02dce88daa99e5755238))
* bump aks sku from free to standard to address API server perfo… ([#1121](https://github.com/defenseunicorns/uds-core/issues/1121)) ([bcb8848](https://github.com/defenseunicorns/uds-core/commit/bcb8848d92f5c7825ffd0b96a21e27ed106a9c1f))
* **deps:** update curl to v8.11.1 ([#1110](https://github.com/defenseunicorns/uds-core/issues/1110)) ([39a656c](https://github.com/defenseunicorns/uds-core/commit/39a656c9863d62f190025b6ba5873e4e2cab6126))
* **deps:** update grafana ([#1126](https://github.com/defenseunicorns/uds-core/issues/1126)) ([056a6ee](https://github.com/defenseunicorns/uds-core/commit/056a6ee26dc16d566a0f9356ae53405cc8285800))
* **deps:** update grafana to 11.4.0 ([#1053](https://github.com/defenseunicorns/uds-core/issues/1053)) ([77aa0b4](https://github.com/defenseunicorns/uds-core/commit/77aa0b4837458169aaa4081fc82afdaf66723668))
* **deps:** update identity-config to v0.9.0 ([#1129](https://github.com/defenseunicorns/uds-core/issues/1129)) ([da720b2](https://github.com/defenseunicorns/uds-core/commit/da720b2928e6c845b3a1cfd3b6a313fcddaf13d2))
* **deps:** update istio to v1.24.1 ([#962](https://github.com/defenseunicorns/uds-core/issues/962)) ([8ecd5ff](https://github.com/defenseunicorns/uds-core/commit/8ecd5ffab3f077e41feff43e6467b9fa1866d9c8))
* **deps:** update loki to 3.3.1 ([#1022](https://github.com/defenseunicorns/uds-core/issues/1022)) ([42d5bda](https://github.com/defenseunicorns/uds-core/commit/42d5bdaec68515a2e204bef33b6b86acc962910e))
* **deps:** update pepr to 0.42.0 (https://github.com/defenseunicorns/uds-core/pull/1095) ([3ebae7b](https://github.com/defenseunicorns/uds-core/commit/3ebae7bc1bc3e9c24cef2d239afc1d5f4261165c))
* **deps:** update pepr to v0.42.1 ([#1116](https://github.com/defenseunicorns/uds-core/issues/1116)) ([bde01da](https://github.com/defenseunicorns/uds-core/commit/bde01da9c80fe3cc9c6bbc1de7843abd90846e5b))
* **deps:** update playwright to v1.49.1 ([#1103](https://github.com/defenseunicorns/uds-core/issues/1103)) ([658ad0d](https://github.com/defenseunicorns/uds-core/commit/658ad0d0f360855f8e187a192114c1999dd56dbc))
* **deps:** update support-deps ([#1076](https://github.com/defenseunicorns/uds-core/issues/1076)) ([2fa010f](https://github.com/defenseunicorns/uds-core/commit/2fa010fc58fdb95280c431511e92315ccd9a86ff))
* **deps:** update support-deps ([#1100](https://github.com/defenseunicorns/uds-core/issues/1100)) ([777387b](https://github.com/defenseunicorns/uds-core/commit/777387b01be6307d5f888ba0ce7c0ae078f52e42))
* **deps:** update support-deps ([#1105](https://github.com/defenseunicorns/uds-core/issues/1105)) ([18472ea](https://github.com/defenseunicorns/uds-core/commit/18472ea172283a4b87397c20c82f5dbf18f18bed))
* **deps:** update support-deps ([#1117](https://github.com/defenseunicorns/uds-core/issues/1117)) ([5b2e3a4](https://github.com/defenseunicorns/uds-core/commit/5b2e3a41cbf079f327ca56c00d6c15e54350779b))
* **deps:** update support-deps ([#1125](https://github.com/defenseunicorns/uds-core/issues/1125)) ([4a1bdfb](https://github.com/defenseunicorns/uds-core/commit/4a1bdfb99e9c92171dc65d1f1c7a22012629b162))
* **deps:** update vector to 0.43.1 ([#1107](https://github.com/defenseunicorns/uds-core/issues/1107)) ([2f6c8b5](https://github.com/defenseunicorns/uds-core/commit/2f6c8b5ebc7d6ab00121aa3ad3d2685c8c58a020))
* **deps:** update velero kubectl to v1.31.4 ([#1108](https://github.com/defenseunicorns/uds-core/issues/1108)) ([bd8ee0e](https://github.com/defenseunicorns/uds-core/commit/bd8ee0e8312e73961b06ad76ebc86ef471f8790d))
* **deps:** update velero to v1.32.0 ([#1128](https://github.com/defenseunicorns/uds-core/issues/1128)) ([669ebe5](https://github.com/defenseunicorns/uds-core/commit/669ebe5a522064d265e48488cdbae33edc814021))
* **docs:** replace promtail reference with vector in prerequisites ([#1098](https://github.com/defenseunicorns/uds-core/issues/1098)) ([33cee59](https://github.com/defenseunicorns/uds-core/commit/33cee59c8a007252a3e6964c8fe341934033443a))
* remove loki peerauth exception ([#1106](https://github.com/defenseunicorns/uds-core/issues/1106)) ([f87a96d](https://github.com/defenseunicorns/uds-core/commit/f87a96dfb785352e3b610eb4cec91d7e591bd55b))
* update arch diagrams ([#1120](https://github.com/defenseunicorns/uds-core/issues/1120)) ([e8a1beb](https://github.com/defenseunicorns/uds-core/commit/e8a1beb0b8ee01d033d8c85c4993becda834ede5))
* update doc-gen output_dir ([#1123](https://github.com/defenseunicorns/uds-core/issues/1123)) ([496ea40](https://github.com/defenseunicorns/uds-core/commit/496ea405e5270fd130ae8b6d21283a3c10261407))
* update infra ci to run weekly and on release pr ([#1124](https://github.com/defenseunicorns/uds-core/issues/1124)) ([79534c9](https://github.com/defenseunicorns/uds-core/commit/79534c960724b728b8692cb8b5bd5e53703b5ff0))
* update README to explicitly indicate the need for a running co… ([#1113](https://github.com/defenseunicorns/uds-core/issues/1113)) ([6426c5a](https://github.com/defenseunicorns/uds-core/commit/6426c5aaf75bcb761b27ca415cf5736631a72f85))

## [0.32.1](https://github.com/defenseunicorns/uds-core/compare/v0.32.0...v0.32.1) (2024-12-05)


### Bug Fixes

* change grafana -&gt; prometheus to https ([#1043](https://github.com/defenseunicorns/uds-core/issues/1043)) ([6ef3169](https://github.com/defenseunicorns/uds-core/commit/6ef3169de2c337cbc3ce47b0dbca0dfbcead3143))
* client timeouts ([#1062](https://github.com/defenseunicorns/uds-core/issues/1062)) ([e71c1da](https://github.com/defenseunicorns/uds-core/commit/e71c1da724c1f590405200edb60fd90bb1df89bb))
* kubeapi watch updates, allow configurable cidr ([#1075](https://github.com/defenseunicorns/uds-core/issues/1075)) ([3285908](https://github.com/defenseunicorns/uds-core/commit/3285908d8e74b29d3a8a37b84833381eb02616db))
* update nightly ci timeouts ([#1058](https://github.com/defenseunicorns/uds-core/issues/1058)) ([2b1a440](https://github.com/defenseunicorns/uds-core/commit/2b1a44080f5310be285d5a0ffe6d049eea2b4886))
* value paths for cpu override ([#1055](https://github.com/defenseunicorns/uds-core/issues/1055)) ([5a21c28](https://github.com/defenseunicorns/uds-core/commit/5a21c2894cd86dfea8d5c02c4f7ac85ebf2dc269))


### Miscellaneous

* cleanup doc ([#1078](https://github.com/defenseunicorns/uds-core/issues/1078)) ([286feb4](https://github.com/defenseunicorns/uds-core/commit/286feb44abacf04b0d92c8db598d9e4f39700f41))
* **deps:** update aws provider to ~&gt; 5.77.0 ([#1036](https://github.com/defenseunicorns/uds-core/issues/1036)) ([84fa893](https://github.com/defenseunicorns/uds-core/commit/84fa893a5420f4cc0b9eedf706935946b1506e04))
* **deps:** update grafana to v8.6.1 ([#1040](https://github.com/defenseunicorns/uds-core/issues/1040)) ([1454397](https://github.com/defenseunicorns/uds-core/commit/1454397f1a44361032680a3b2c9d739b46a5e5c1))
* **deps:** update keycloak to v26.0.6 ([#1041](https://github.com/defenseunicorns/uds-core/issues/1041)) ([582db22](https://github.com/defenseunicorns/uds-core/commit/582db22e5ac759fa6bc823849f35a736b803da8f))
* **deps:** update keycloak to v26.0.7 ([#1057](https://github.com/defenseunicorns/uds-core/issues/1057)) ([ef96ef0](https://github.com/defenseunicorns/uds-core/commit/ef96ef056ec5ccb3ca6956bc687dd8cebe31dbc8))
* **deps:** update neuvector to 5.4.1 ([#1039](https://github.com/defenseunicorns/uds-core/issues/1039)) ([8727675](https://github.com/defenseunicorns/uds-core/commit/8727675d8137b5e84c4337bd7f794633a397ab47))
* **deps:** update node types to v22.9.3 ([#1049](https://github.com/defenseunicorns/uds-core/issues/1049)) ([e454222](https://github.com/defenseunicorns/uds-core/commit/e454222f1b994f99134f510c325369715964651d))
* **deps:** update node types to v22.9.4 ([#1051](https://github.com/defenseunicorns/uds-core/issues/1051)) ([0f0240a](https://github.com/defenseunicorns/uds-core/commit/0f0240a5d6b57ba83379ad9525956355b39bb69f))
* **deps:** update support dependencies to v0.196.0 ([#1054](https://github.com/defenseunicorns/uds-core/issues/1054)) ([67419f5](https://github.com/defenseunicorns/uds-core/commit/67419f536f957f39c99c1f7b6c6131f0c2c50e84))
* **deps:** update support-deps ([#1046](https://github.com/defenseunicorns/uds-core/issues/1046)) ([6cf96f0](https://github.com/defenseunicorns/uds-core/commit/6cf96f052e038cb3397ce166c142bb88b981caaf))
* **deps:** update support-deps ([#1048](https://github.com/defenseunicorns/uds-core/issues/1048)) ([d77155f](https://github.com/defenseunicorns/uds-core/commit/d77155ff7e91e11cb5f1c02cb75fcd514d60bb5f))
* **deps:** update support-deps ([#1052](https://github.com/defenseunicorns/uds-core/issues/1052)) ([e1cf7db](https://github.com/defenseunicorns/uds-core/commit/e1cf7db82ddaa4c0fced55e8b39f0567696933c2))
* **deps:** update support-deps ([#1056](https://github.com/defenseunicorns/uds-core/issues/1056)) ([abab719](https://github.com/defenseunicorns/uds-core/commit/abab71919c6c268c59426a6ccca92622f80c2d6f))
* **deps:** update vector helm chart to v0.38.0 ([#1092](https://github.com/defenseunicorns/uds-core/issues/1092)) ([2cb4181](https://github.com/defenseunicorns/uds-core/commit/2cb41812cdf6482fdb053aff2c617f21a3d389b2))
* **deps:** update vector to v0.43.0 ([#1059](https://github.com/defenseunicorns/uds-core/issues/1059)) ([55bf0b3](https://github.com/defenseunicorns/uds-core/commit/55bf0b3a05046c4cc72d55a62bdd9140f2205aa2))
* **deps:** update velero chart to v8.1.0 ([#1050](https://github.com/defenseunicorns/uds-core/issues/1050)) ([7b0d51b](https://github.com/defenseunicorns/uds-core/commit/7b0d51b2e73ce7a30397c3942fcc4de3177d81ac))
* **deps:** update velero kubectl images to v1.31.3 ([#1034](https://github.com/defenseunicorns/uds-core/issues/1034)) ([9bf286f](https://github.com/defenseunicorns/uds-core/commit/9bf286fe5afa6c6ef79995a6ef99ed9e66d2adeb))
* fix checkpoint to properly publish uds-core ([#1044](https://github.com/defenseunicorns/uds-core/issues/1044)) ([f1c54cf](https://github.com/defenseunicorns/uds-core/commit/f1c54cf17372eee1b74c96e5a2c73a6a5f8ebea7))
* reduce default cpu requests for dev/demo bundles ([#1047](https://github.com/defenseunicorns/uds-core/issues/1047)) ([e0bde2f](https://github.com/defenseunicorns/uds-core/commit/e0bde2f4e988377b61d70b112c1f7d6a4b8abdc8))
* update cli install to use setup-uds action ([#1061](https://github.com/defenseunicorns/uds-core/issues/1061)) ([daebe9b](https://github.com/defenseunicorns/uds-core/commit/daebe9b6813212c090622f78be85607fab6f6dc6))

## [0.32.0](https://github.com/defenseunicorns/uds-core/compare/v0.31.2...v0.32.0) (2024-11-22)


### Features

* add ability to add custom netpols for prometheus-stack package ([#997](https://github.com/defenseunicorns/uds-core/issues/997)) ([472f9c5](https://github.com/defenseunicorns/uds-core/commit/472f9c528d893820cdc0f3e86a63e9aa628330b8))
* add checkpoint uds-core slim package ([#818](https://github.com/defenseunicorns/uds-core/issues/818)) ([d95f6be](https://github.com/defenseunicorns/uds-core/commit/d95f6be3c4d0a271ca029d75ec540e593456934c))
* allow additional network rules for grafana and neuvector ([#1038](https://github.com/defenseunicorns/uds-core/issues/1038)) ([5c84007](https://github.com/defenseunicorns/uds-core/commit/5c84007a7519a5896efababc1ce4ce57a89935bb))


### Bug Fixes

* keycloak upgrade wait ([#1037](https://github.com/defenseunicorns/uds-core/issues/1037)) ([1207812](https://github.com/defenseunicorns/uds-core/commit/12078125fadd308509baefe60b2c4fa753734c23))


### Miscellaneous

* add variables for pepr memory requests in dev/demo bundles ([#1021](https://github.com/defenseunicorns/uds-core/issues/1021)) ([867501c](https://github.com/defenseunicorns/uds-core/commit/867501c2ef7ff9f5cdf6719c9796b8189008f005))
* architecture diagrams ([#1024](https://github.com/defenseunicorns/uds-core/issues/1024)) ([d0bca43](https://github.com/defenseunicorns/uds-core/commit/d0bca432896992dd6843cba38523ea8c251bd330))
* **deps:** update grafana helm chart ([#998](https://github.com/defenseunicorns/uds-core/issues/998)) ([25d4c29](https://github.com/defenseunicorns/uds-core/commit/25d4c29febb3c119951e335496534cea8d6f6f49))
* **deps:** update grafana to v11.3.1 ([#1023](https://github.com/defenseunicorns/uds-core/issues/1023)) ([8d3cf3a](https://github.com/defenseunicorns/uds-core/commit/8d3cf3afb779b72a8b5fe1ae6cceb3d889ca509c))
* **deps:** update husky to v9.1.7 ([#1014](https://github.com/defenseunicorns/uds-core/issues/1014)) ([0d9a854](https://github.com/defenseunicorns/uds-core/commit/0d9a8549881bfc59cb369154480d2d35bb0dd04a))
* **deps:** update kfc for jest to v3.3.3 ([#1015](https://github.com/defenseunicorns/uds-core/issues/1015)) ([eba189e](https://github.com/defenseunicorns/uds-core/commit/eba189e2aa183fef489d134c05fc52f5a39de8fb))
* **deps:** update neuvector to 5.4.0 ([#778](https://github.com/defenseunicorns/uds-core/issues/778)) ([ccd0a32](https://github.com/defenseunicorns/uds-core/commit/ccd0a323a0ba396a93a292205f27800e411f57e4))
* **deps:** update pepr to v0.40.1 ([#1025](https://github.com/defenseunicorns/uds-core/issues/1025)) ([871bdad](https://github.com/defenseunicorns/uds-core/commit/871bdadbebb82f5ab6cb36285cb1172e2efdbf93))
* **deps:** update support-deps ([#1006](https://github.com/defenseunicorns/uds-core/issues/1006)) ([bfb66a4](https://github.com/defenseunicorns/uds-core/commit/bfb66a4cc733bb7e77224c4e8e164497c2e030c0))
* **deps:** update support-deps ([#1019](https://github.com/defenseunicorns/uds-core/issues/1019)) ([82dfb32](https://github.com/defenseunicorns/uds-core/commit/82dfb32383569877eea7c860da7e4713329f8ecc))
* **deps:** update velero helm chart to v8 ([#999](https://github.com/defenseunicorns/uds-core/issues/999)) ([e8187be](https://github.com/defenseunicorns/uds-core/commit/e8187bee95452f06c7c4ecf85c17b8547b963f60))
* fix duplicative checkpoint publish location ([#1020](https://github.com/defenseunicorns/uds-core/issues/1020)) ([b497fc5](https://github.com/defenseunicorns/uds-core/commit/b497fc53f3a330fdc3adbf67d6d8adbe5a7686d7))
* update diagrams ([#1035](https://github.com/defenseunicorns/uds-core/issues/1035)) ([cca5e2c](https://github.com/defenseunicorns/uds-core/commit/cca5e2c9f33b7ff3370876b333c7ebfb6cf3998b))

## [0.31.2](https://github.com/defenseunicorns/uds-core/compare/v0.31.1...v0.31.2) (2024-11-15)


### Bug Fixes

* scale keycloak sts to zero if deployed in ha mode ([#1010](https://github.com/defenseunicorns/uds-core/issues/1010)) ([9bae9b3](https://github.com/defenseunicorns/uds-core/commit/9bae9b305f5638bca00205f919a8f6fb90d67b79))


### Miscellaneous

* update `*.uds.dev` and `*.admin.uds.dev` certs ([#1012](https://github.com/defenseunicorns/uds-core/issues/1012)) ([fe31263](https://github.com/defenseunicorns/uds-core/commit/fe312632fa59cab511755778e52e0ce200481ac4))

## [0.31.1](https://github.com/defenseunicorns/uds-core/compare/v0.31.0...v0.31.1) (2024-11-13)


### Miscellaneous

* **deps:** update pepr to v0.39.1 ([#1003](https://github.com/defenseunicorns/uds-core/issues/1003)) ([c0b1dbf](https://github.com/defenseunicorns/uds-core/commit/c0b1dbf66aea906ea7badb5bc90c07f6cc42cf50))
* **deps:** update support dependencies to v3.27.3 ([#1004](https://github.com/defenseunicorns/uds-core/issues/1004)) ([9fbb4a9](https://github.com/defenseunicorns/uds-core/commit/9fbb4a965beacfc637ada47ccc3776b3584ab8c1))

## [0.31.0](https://github.com/defenseunicorns/uds-core/compare/v0.30.0...v0.31.0) (2024-11-12)


### ⚠ BREAKING CHANGES

* Remove the generated exception block from the remoteCidr generation. This change means that a cidr containing the META_IP could be set.

### Bug Fixes

* avoids memory leak in istio sidecar termination ([#972](https://github.com/defenseunicorns/uds-core/issues/972)) ([bfd415e](https://github.com/defenseunicorns/uds-core/commit/bfd415eb830a993dc9a815b77e298d5715ec1f6e))
* ensure grafana does not install plugins from the internet ([#993](https://github.com/defenseunicorns/uds-core/issues/993)) ([f3def45](https://github.com/defenseunicorns/uds-core/commit/f3def45b115e5dba9f16cc121d8a435fad06c0ae))
* remove remoteCidr exception block ([#987](https://github.com/defenseunicorns/uds-core/issues/987)) ([264fbf6](https://github.com/defenseunicorns/uds-core/commit/264fbf68319eec3ea52eac3b0c913a93a4fc69ce))
* renovate config updated to track tests ([#981](https://github.com/defenseunicorns/uds-core/issues/981)) ([2494448](https://github.com/defenseunicorns/uds-core/commit/24944482f664e9b445b9cfdd1e7616fbf049ad05))
* sets `fail-fast` to `false` for matrix workflows ([#995](https://github.com/defenseunicorns/uds-core/issues/995)) ([3008788](https://github.com/defenseunicorns/uds-core/commit/30087884c811d5b5e5c0d0d5112e7852260fbe84))
* sort auth chains when building the authservice config ([#969](https://github.com/defenseunicorns/uds-core/issues/969)) ([15487fb](https://github.com/defenseunicorns/uds-core/commit/15487fbacb7a815abe237c1bfefdd4031086956b))


### Miscellaneous

* add prometheus, loki, and vector e2e testing ([#939](https://github.com/defenseunicorns/uds-core/issues/939)) ([f271ce2](https://github.com/defenseunicorns/uds-core/commit/f271ce2e29f1419489e9995e1b47b11655183d84))
* add the scorecard supply chain security workflow ([#917](https://github.com/defenseunicorns/uds-core/issues/917)) ([5626f2f](https://github.com/defenseunicorns/uds-core/commit/5626f2f43ea2da417802e34f398b93e527d355c0))
* **deps:** update authservice to v1.0.3 ([#893](https://github.com/defenseunicorns/uds-core/issues/893)) ([5585a3c](https://github.com/defenseunicorns/uds-core/commit/5585a3c6b81e5be27be3a16aec06e9dd4fa863df))
* **deps:** update grafana curl-fips image to v8.11.0 ([#994](https://github.com/defenseunicorns/uds-core/issues/994)) ([dfc4c8c](https://github.com/defenseunicorns/uds-core/commit/dfc4c8c805cc9a9fa632a9e72ae28dc3028f38b1))
* **deps:** update grafana to 11.3.0 ([#921](https://github.com/defenseunicorns/uds-core/issues/921)) ([7cdd742](https://github.com/defenseunicorns/uds-core/commit/7cdd7429fe09a24407c566cbf60e160ddd0957af))
* **deps:** update loki to 3.2.1 ([#918](https://github.com/defenseunicorns/uds-core/issues/918)) ([5fa6a24](https://github.com/defenseunicorns/uds-core/commit/5fa6a2499a6d64e70cb26b88e8a031870592bb5c))
* **deps:** update loki to v6.19.0 ([#990](https://github.com/defenseunicorns/uds-core/issues/990)) ([8bbac53](https://github.com/defenseunicorns/uds-core/commit/8bbac536308624ad4199bf55044a35dc2c4c5552))
* **deps:** update pepr to v0.39.0 ([#932](https://github.com/defenseunicorns/uds-core/issues/932)) ([27eb1bd](https://github.com/defenseunicorns/uds-core/commit/27eb1bda4c3c53c27752732463a19bc041188d4e))
* **deps:** update support dependencies to v3.27.2 ([#1001](https://github.com/defenseunicorns/uds-core/issues/1001)) ([8702952](https://github.com/defenseunicorns/uds-core/commit/87029525eb41b50c04b22b44352f883207fa7d86))
* **deps:** update support dependencies to v3.3.0 ([#985](https://github.com/defenseunicorns/uds-core/issues/985)) ([4636a38](https://github.com/defenseunicorns/uds-core/commit/4636a380f8e311ee514d8cb435a9a3dce92fd91a))
* **deps:** update support dependencies to v3.3.1 ([#1002](https://github.com/defenseunicorns/uds-core/issues/1002)) ([8c20b49](https://github.com/defenseunicorns/uds-core/commit/8c20b49c509d3b7a81be4cd45435c7a056d0249c))
* **deps:** update support-deps ([#928](https://github.com/defenseunicorns/uds-core/issues/928)) ([a9cf1f2](https://github.com/defenseunicorns/uds-core/commit/a9cf1f2be664047e5aaf86de6fa480a021934f29))
* **deps:** update support-deps ([#983](https://github.com/defenseunicorns/uds-core/issues/983)) ([dc3084b](https://github.com/defenseunicorns/uds-core/commit/dc3084b21db0f002f3fb4a1c1d925f241252344e))
* **deps:** update support-deps ([#989](https://github.com/defenseunicorns/uds-core/issues/989)) ([7a1c74e](https://github.com/defenseunicorns/uds-core/commit/7a1c74ef397b48f4dae67a58b1b84261fc1bb2cb))
* **deps:** update velero ([#956](https://github.com/defenseunicorns/uds-core/issues/956)) ([7746092](https://github.com/defenseunicorns/uds-core/commit/77460920ffaed6f4f3a7172d5ada00c2e579206d))
* regroup renovate support dependencies ([#979](https://github.com/defenseunicorns/uds-core/issues/979)) ([6491be9](https://github.com/defenseunicorns/uds-core/commit/6491be9c1c3948b3f76e2ac8600615547958edda))

## [0.30.0](https://github.com/defenseunicorns/uds-core/compare/v0.29.1...v0.30.0) (2024-10-28)


### ⚠ BREAKING CHANGES

* remove uds-runtime from core ([#955](https://github.com/defenseunicorns/uds-core/issues/955))

### Features

* add finalizer for UDS Package CRs ([#953](https://github.com/defenseunicorns/uds-core/issues/953)) ([fa42714](https://github.com/defenseunicorns/uds-core/commit/fa427142b8a7391504eb2133614cf7504e0259ab))
* adds registry1 flavor of uds runtime ([#925](https://github.com/defenseunicorns/uds-core/issues/925)) ([0011852](https://github.com/defenseunicorns/uds-core/commit/0011852dd6c8f1305e2fa0c837db45f3c1801c31))


### Bug Fixes

* batch authservice checksum updates ([#735](https://github.com/defenseunicorns/uds-core/issues/735)) ([100d35b](https://github.com/defenseunicorns/uds-core/commit/100d35bfb05545b2a6adb75c918e6e93eda0a312))
* logout redirect uri ([#945](https://github.com/defenseunicorns/uds-core/issues/945)) ([8e2b5d8](https://github.com/defenseunicorns/uds-core/commit/8e2b5d840bcddc7af299ff8845836c08a54a35c8))
* resolve lingering note formatting ([#938](https://github.com/defenseunicorns/uds-core/issues/938)) ([455a530](https://github.com/defenseunicorns/uds-core/commit/455a53020cee8fe9edf629366401c70fd47ef355))
* vector remap language logic typo ([#959](https://github.com/defenseunicorns/uds-core/issues/959)) ([89af729](https://github.com/defenseunicorns/uds-core/commit/89af7292b11ac9a9d100ba1e6a81c81441472f14))


### Miscellaneous

* add proper version update to aks nightly bundle ([#942](https://github.com/defenseunicorns/uds-core/issues/942)) ([2f51c75](https://github.com/defenseunicorns/uds-core/commit/2f51c75d761e3385a3ae46cb62d6375210620c37))
* block local auth for neuvector ([#965](https://github.com/defenseunicorns/uds-core/issues/965)) ([8f25b41](https://github.com/defenseunicorns/uds-core/commit/8f25b41e4c187680e8353e31cdd4f37e19063338))
* **deps:** update vector to 0.42.0 ([#946](https://github.com/defenseunicorns/uds-core/issues/946)) ([2f63db2](https://github.com/defenseunicorns/uds-core/commit/2f63db2f26cb30c056f376b1823f758cd403aefe))
* remove uds-runtime from core ([#955](https://github.com/defenseunicorns/uds-core/issues/955)) ([c6f6664](https://github.com/defenseunicorns/uds-core/commit/c6f66649bef5fef8e14eeb157a1ba76d2e96c78b))

## [0.29.1](https://github.com/defenseunicorns/uds-core/compare/v0.29.0...v0.29.1) (2024-10-18)


### Bug Fixes

* adr link in func layers doc ([#903](https://github.com/defenseunicorns/uds-core/issues/903)) ([c42ccf8](https://github.com/defenseunicorns/uds-core/commit/c42ccf87c7bced4402d308e3400a0dc78ec017c3))
* codespell config ([#934](https://github.com/defenseunicorns/uds-core/issues/934)) ([73eb385](https://github.com/defenseunicorns/uds-core/commit/73eb3852391740694b712626f5ef9c150ae968ff))
* decompose istio oscal ([#826](https://github.com/defenseunicorns/uds-core/issues/826)) ([83c6ae5](https://github.com/defenseunicorns/uds-core/commit/83c6ae53057c798c8b52f822f61e4fe008fe2522))
* don't add duplicate policy names to `uds-core.pepr.dev/mutated` annotation ([#916](https://github.com/defenseunicorns/uds-core/issues/916)) ([99d1c83](https://github.com/defenseunicorns/uds-core/commit/99d1c83a64904f4af373e4618172d05f0d8c7151))
* istio proxy exiting early when Pod has restart policy ([#914](https://github.com/defenseunicorns/uds-core/issues/914)) ([f87e3d4](https://github.com/defenseunicorns/uds-core/commit/f87e3d4b4e509f7bea7f642ccf6e6846430b2497))
* release-please for aks ([#941](https://github.com/defenseunicorns/uds-core/issues/941)) ([5c77285](https://github.com/defenseunicorns/uds-core/commit/5c7728501140015d06c5f4945362fb274402ab7d))
* test ci license check ([#924](https://github.com/defenseunicorns/uds-core/issues/924)) ([c5b1d54](https://github.com/defenseunicorns/uds-core/commit/c5b1d545aa7241c1895eb432fc7f5daaf198ab8e))


### Miscellaneous

* add e2e playwright tests for grafana ([#844](https://github.com/defenseunicorns/uds-core/issues/844)) ([1af5a8f](https://github.com/defenseunicorns/uds-core/commit/1af5a8f89783579f082a6ab2e2c36f50a5c73c63))
* add local lula compose task ([#892](https://github.com/defenseunicorns/uds-core/issues/892)) ([075b519](https://github.com/defenseunicorns/uds-core/commit/075b5191142e43e9183d26644f869fc9789af618))
* add nightly testing for AKS ([#908](https://github.com/defenseunicorns/uds-core/issues/908)) ([105aea6](https://github.com/defenseunicorns/uds-core/commit/105aea6d87eb87de261e84fc1189c60361fc012e))
* add playwright deps to support-deps renovate ([#937](https://github.com/defenseunicorns/uds-core/issues/937)) ([94655cd](https://github.com/defenseunicorns/uds-core/commit/94655cdbd67e9e30871067ba3a6ceaa4be52e7a4))
* **deps:** revert pepr to 0.37.2 ([#940](https://github.com/defenseunicorns/uds-core/issues/940)) ([3317bbe](https://github.com/defenseunicorns/uds-core/commit/3317bbe148583c7ba1455b642f4e78dd3807d7d4))
* **deps:** update grafana helm chart to v8.5.5 ([#905](https://github.com/defenseunicorns/uds-core/issues/905)) ([ca9a485](https://github.com/defenseunicorns/uds-core/commit/ca9a48587a395ccdcbe6cf5c2256f0f4103efdbf))
* **deps:** update pepr to v0.38.0 ([#870](https://github.com/defenseunicorns/uds-core/issues/870)) ([de8419c](https://github.com/defenseunicorns/uds-core/commit/de8419c0903c358d00d3633423d4f871e44df1b1))
* **deps:** update pepr to v0.38.0 ([#915](https://github.com/defenseunicorns/uds-core/issues/915)) ([6fe4e57](https://github.com/defenseunicorns/uds-core/commit/6fe4e5769fa3772f2ff9f8f726da81e0e728e2f2))
* **deps:** update pepr to v0.38.1 ([#922](https://github.com/defenseunicorns/uds-core/issues/922)) ([3c5d341](https://github.com/defenseunicorns/uds-core/commit/3c5d3416ffb3141f40b83601b94699e532a572f0))
* **deps:** update prometheus-stack ([#863](https://github.com/defenseunicorns/uds-core/issues/863)) ([d3f03b4](https://github.com/defenseunicorns/uds-core/commit/d3f03b4e1c25637b9bdd3884048095839d44bf0b))
* **deps:** update prometheus-stack to v65.3.1 ([#920](https://github.com/defenseunicorns/uds-core/issues/920)) ([0b80107](https://github.com/defenseunicorns/uds-core/commit/0b80107633116679882c6d06dc1ef2dbeab93f75))
* **deps:** update runtime to v0.6.1 ([#910](https://github.com/defenseunicorns/uds-core/issues/910)) ([be63105](https://github.com/defenseunicorns/uds-core/commit/be631055038d637559d375a8c75859a31885afc7))
* **deps:** update support dependencies to v0.192.0 ([#906](https://github.com/defenseunicorns/uds-core/issues/906)) ([8dfd362](https://github.com/defenseunicorns/uds-core/commit/8dfd362e770e3525a90a11481b1cfb88fe04eca2))
* **deps:** update support-deps ([#898](https://github.com/defenseunicorns/uds-core/issues/898)) ([380af83](https://github.com/defenseunicorns/uds-core/commit/380af8378f731228f0840265f143e187e882b443))
* **deps:** update support-deps ([#912](https://github.com/defenseunicorns/uds-core/issues/912)) ([bf23a89](https://github.com/defenseunicorns/uds-core/commit/bf23a896c9386577d2455b0879c21794711a0b6f))
* **docs:** custom resource docs generation ([#902](https://github.com/defenseunicorns/uds-core/issues/902)) ([e73597d](https://github.com/defenseunicorns/uds-core/commit/e73597d9370ef255b200caf537a336bd2fef5f76))
* ensure http2 watch config is used by internal exemption watch ([#909](https://github.com/defenseunicorns/uds-core/issues/909)) ([25bfd59](https://github.com/defenseunicorns/uds-core/commit/25bfd5908faae0de730cab725d012674c321924e))
* group setup action in support deps ([#930](https://github.com/defenseunicorns/uds-core/issues/930)) ([d0a0123](https://github.com/defenseunicorns/uds-core/commit/d0a0123a88c7aa83a34db2df94abffcecc390492))
* group vscode/settings.json with support-deps ([#933](https://github.com/defenseunicorns/uds-core/issues/933)) ([81e41d8](https://github.com/defenseunicorns/uds-core/commit/81e41d841589b05ecc6891d8f822e36cbf8e3d30))

## [0.29.0](https://github.com/defenseunicorns/uds-core/compare/v0.28.0...v0.29.0) (2024-10-11)


### Features

* add base and identity layers ([#853](https://github.com/defenseunicorns/uds-core/issues/853)) ([b3f532a](https://github.com/defenseunicorns/uds-core/commit/b3f532a4fe49e00b2cbcfb8bd4555a807355e8dd))
* add logging functional layer ([#861](https://github.com/defenseunicorns/uds-core/issues/861)) ([c1a67b9](https://github.com/defenseunicorns/uds-core/commit/c1a67b968116570f81c570f51145d3183c386d14))
* add metrics-server functional layer ([#865](https://github.com/defenseunicorns/uds-core/issues/865)) ([290367a](https://github.com/defenseunicorns/uds-core/commit/290367af2251c45fdc2ebb0b8f394b2c1ac2f0d8))
* add monitoring layer ([#872](https://github.com/defenseunicorns/uds-core/issues/872)) ([5ecb040](https://github.com/defenseunicorns/uds-core/commit/5ecb040bb27d8fed2a15617830cc6805df9c6ec7))
* add nightly testing for rke2 ([#808](https://github.com/defenseunicorns/uds-core/issues/808)) ([c401419](https://github.com/defenseunicorns/uds-core/commit/c4014197b19483657ccc1951d062263433e8b4af))
* add service accounts options to sso ([#852](https://github.com/defenseunicorns/uds-core/issues/852)) ([1029162](https://github.com/defenseunicorns/uds-core/commit/102916223bbfe4f6d555f72fd8d3a9593853d160))
* backup and restore layer, ui layer, runtime security layer ([#862](https://github.com/defenseunicorns/uds-core/issues/862)) ([b1d8015](https://github.com/defenseunicorns/uds-core/commit/b1d8015f61b984441578a860d29043d52013082a))
* grafana-ha ([#838](https://github.com/defenseunicorns/uds-core/issues/838)) ([d532d76](https://github.com/defenseunicorns/uds-core/commit/d532d76f8242a68cf39b5aac7c3b4a8c241d56b3))


### Bug Fixes

* broken readme link ([#899](https://github.com/defenseunicorns/uds-core/issues/899)) ([6e47b11](https://github.com/defenseunicorns/uds-core/commit/6e47b11f85075c3942c1ca193d5e9d90747b6109))
* **ci:** switch to larger runners to resolve ci disk space issues ([#882](https://github.com/defenseunicorns/uds-core/issues/882)) ([1af0401](https://github.com/defenseunicorns/uds-core/commit/1af040142babd141441a87ae74fd3c3a530f4fae))
* snapshot ci version modification and tasks for publish ([#877](https://github.com/defenseunicorns/uds-core/issues/877)) ([f01e5bd](https://github.com/defenseunicorns/uds-core/commit/f01e5bdd65edbdfe2088cdc1bb9d62fb8e5c1b04))
* support for anywhere network policies in cilium ([#884](https://github.com/defenseunicorns/uds-core/issues/884)) ([5df0737](https://github.com/defenseunicorns/uds-core/commit/5df073768eb9f8c8f00433413039918bdb85d362))


### Miscellaneous

* cleanup license parsing for github ([#881](https://github.com/defenseunicorns/uds-core/issues/881)) ([43c98ce](https://github.com/defenseunicorns/uds-core/commit/43c98cee6957a3ca155f7fb7e9d3b604c8c5caa7))
* **deps:** update chainctl action to v0.2.3 ([#864](https://github.com/defenseunicorns/uds-core/issues/864)) ([d782b59](https://github.com/defenseunicorns/uds-core/commit/d782b59363184de07c7546c04ad7edb6fa9e6449))
* **deps:** update checkout action to v4.2.0 ([#825](https://github.com/defenseunicorns/uds-core/issues/825)) ([29d1c98](https://github.com/defenseunicorns/uds-core/commit/29d1c98069c73869951878372f7ca1ac842bb87d))
* **deps:** update dependency defenseunicorns/lula to v0.8.0 ([#841](https://github.com/defenseunicorns/uds-core/issues/841)) ([fe36150](https://github.com/defenseunicorns/uds-core/commit/fe36150bceb69155d4aec8d7298fcc19dbca8c36))
* **deps:** update githubactions ([#866](https://github.com/defenseunicorns/uds-core/issues/866)) ([44f8ea5](https://github.com/defenseunicorns/uds-core/commit/44f8ea5f12b9d0bda9d9231564b95c6a49fd8e83))
* **deps:** update grafana to 11.2.1 ([#836](https://github.com/defenseunicorns/uds-core/issues/836)) ([11383c1](https://github.com/defenseunicorns/uds-core/commit/11383c188e4f799b5e8e09dc67e5b6f6ebfdca3e))
* **deps:** update grafana to v11.2.2 ([#867](https://github.com/defenseunicorns/uds-core/issues/867)) ([06ed2c3](https://github.com/defenseunicorns/uds-core/commit/06ed2c323a3f1e895d6f3f87e5388f7a06197b1c))
* **deps:** update loki nginx image to v1.27.2 ([#894](https://github.com/defenseunicorns/uds-core/issues/894)) ([df7d427](https://github.com/defenseunicorns/uds-core/commit/df7d427cf8f830d7590a144ff9e902245433460b))
* **deps:** update loki to v3.2.0 ([#791](https://github.com/defenseunicorns/uds-core/issues/791)) ([d3c60b5](https://github.com/defenseunicorns/uds-core/commit/d3c60b5678982d774a721838cf75e06c20087c73))
* **deps:** update metrics-server chart to v3.12.2 ([#873](https://github.com/defenseunicorns/uds-core/issues/873)) ([e2e61ce](https://github.com/defenseunicorns/uds-core/commit/e2e61ce3319aa9ac48762afe097d72f97175bbce))
* **deps:** update pepr to v0.37.1 ([#843](https://github.com/defenseunicorns/uds-core/issues/843)) ([68abcb2](https://github.com/defenseunicorns/uds-core/commit/68abcb2df5b7e2097a56e949624790445bc02b41))
* **deps:** update pepr to v0.37.2 ([#850](https://github.com/defenseunicorns/uds-core/issues/850)) ([b51f659](https://github.com/defenseunicorns/uds-core/commit/b51f659ffbb3880a5da74aa90b62c5ef4a7a05cc))
* **deps:** update prometheus operator to 0.77.1 ([#819](https://github.com/defenseunicorns/uds-core/issues/819)) ([0864b33](https://github.com/defenseunicorns/uds-core/commit/0864b33b2ecde7f73d28c3bad6dab10275969346))
* **deps:** update prometheus-stack ([#855](https://github.com/defenseunicorns/uds-core/issues/855)) ([c791c24](https://github.com/defenseunicorns/uds-core/commit/c791c24de4d27678778225f8487629e6353a2d64))
* **deps:** update prometheus-stack helm-charts to v64.0.0 ([#849](https://github.com/defenseunicorns/uds-core/issues/849)) ([50a2588](https://github.com/defenseunicorns/uds-core/commit/50a258860f79bb291450afbe48a6f61a6650bb9c))
* **deps:** update runtime to v0.6.0 ([#897](https://github.com/defenseunicorns/uds-core/issues/897)) ([89ae6e2](https://github.com/defenseunicorns/uds-core/commit/89ae6e255f32eadf871096bafe0cc1958b1c6e34))
* **deps:** update support-deps ([#890](https://github.com/defenseunicorns/uds-core/issues/890)) ([26ea612](https://github.com/defenseunicorns/uds-core/commit/26ea612bec9ece132509b5ef0d4d1807debbbb62))
* **deps:** update test-infra ([#875](https://github.com/defenseunicorns/uds-core/issues/875)) ([583f07c](https://github.com/defenseunicorns/uds-core/commit/583f07cbf57c2c839b8f6d00bbd098cafe4198a8))
* **deps:** update test-infra to v6.9.0 ([#848](https://github.com/defenseunicorns/uds-core/issues/848)) ([ef9d317](https://github.com/defenseunicorns/uds-core/commit/ef9d317198acedc2007d683b5d169e1f333be433))
* **deps:** update uds to v0.17.0 ([#859](https://github.com/defenseunicorns/uds-core/issues/859)) ([1489fef](https://github.com/defenseunicorns/uds-core/commit/1489fef6d666c54f122373dcdaabda37c3cfafe5))
* **deps:** update zarf to v0.41.0 ([#857](https://github.com/defenseunicorns/uds-core/issues/857)) ([a390c3d](https://github.com/defenseunicorns/uds-core/commit/a390c3d4744ac8cccd4079928844f3568d3caf9f))
* **docs:** update doc structure for site refresh ([#895](https://github.com/defenseunicorns/uds-core/issues/895)) ([1946a9a](https://github.com/defenseunicorns/uds-core/commit/1946a9a8144a0cd383c3af29c33bb828283ef81d))
* fix broken link in docs ([#845](https://github.com/defenseunicorns/uds-core/issues/845)) ([3078a5b](https://github.com/defenseunicorns/uds-core/commit/3078a5b48506a4acb7660f9929279690bcb00984))
* fix license header references ([#901](https://github.com/defenseunicorns/uds-core/issues/901)) ([cf38b82](https://github.com/defenseunicorns/uds-core/commit/cf38b827da351af5b610a064eb0d8fe885b66d89))
* handle upgrade path for functional layers, add doc for usage ([#896](https://github.com/defenseunicorns/uds-core/issues/896)) ([70d6b1b](https://github.com/defenseunicorns/uds-core/commit/70d6b1b943e0e9fc3a36fc7a7600afa0e3f2b511))
* regroup 'support dependencies' in renovate config ([#885](https://github.com/defenseunicorns/uds-core/issues/885)) ([640d859](https://github.com/defenseunicorns/uds-core/commit/640d859a50de6c7d49afec3283fac2a249d04dd7))
* update license ([#878](https://github.com/defenseunicorns/uds-core/issues/878)) ([b086170](https://github.com/defenseunicorns/uds-core/commit/b086170f415c82916a6e493517ac5bc62b2b7aea))

## [0.28.0](https://github.com/defenseunicorns/uds-core/compare/v0.27.3...v0.28.0) (2024-09-27)


### ⚠ BREAKING CHANGES

* Promtail has been removed from UDS Core and replaced by Vector. If you were previously using overrides to setup additional log targets/endpoints for Promtail this configuration will need to be updated to Vector's chart/config formats. See Vector's [Sources and Sinks](https://vector.dev/components/) as well as the [helm chart values](https://github.com/defenseunicorns/uds-core/blob/1bf29582f9c5b1fe01763e86e56c19b6e17aef85/src/vector/values/values.yaml#L4) for guidance in configuration.

### Features

* add support for keycloak saml attributes ([#806](https://github.com/defenseunicorns/uds-core/issues/806)) ([b312b7d](https://github.com/defenseunicorns/uds-core/commit/b312b7de5fab6b688bf5799b0316d067b86887fa))
* exposes tls version for dev bundles ([#809](https://github.com/defenseunicorns/uds-core/issues/809)) ([e1a2b55](https://github.com/defenseunicorns/uds-core/commit/e1a2b55fff1a1feaa5d37016a8f71274eb6dde3e))
* switch from promtail to vector (https://github.com/defenseunicorns/uds-core/pull/724) ([1bf2958](https://github.com/defenseunicorns/uds-core/commit/1bf29582f9c5b1fe01763e86e56c19b6e17aef85))


### Bug Fixes

* eks iac issues, document storage class pre-reqs ([#812](https://github.com/defenseunicorns/uds-core/issues/812)) ([df514bd](https://github.com/defenseunicorns/uds-core/commit/df514bd437e5af0bedb11a3da8860c8aeaccc78c))
* ensure istio sidecar is killed if job fails ([#813](https://github.com/defenseunicorns/uds-core/issues/813)) ([34ffc0a](https://github.com/defenseunicorns/uds-core/commit/34ffc0a22b17489e5b87add6cafc1cc915897936))
* revert test app version to fix CI failures ([#815](https://github.com/defenseunicorns/uds-core/issues/815)) ([2ec6ad6](https://github.com/defenseunicorns/uds-core/commit/2ec6ad6cc7d3cdba1efdd752b7d2bfc2012c9f2a))


### Miscellaneous

* add runtime group to renovate config ([#799](https://github.com/defenseunicorns/uds-core/issues/799)) ([1bf2c69](https://github.com/defenseunicorns/uds-core/commit/1bf2c692d996992775ba827b4d2869430a9929e7))
* **deps:** update dependency defenseunicorns/uds-common to v0.13.0 ([#790](https://github.com/defenseunicorns/uds-core/issues/790)) ([8bfcdc0](https://github.com/defenseunicorns/uds-core/commit/8bfcdc00a8b04f0c7b9f0c88a0e37e8cec8b42f3))
* **deps:** update dependency defenseunicorns/uds-common to v0.13.1 ([#810](https://github.com/defenseunicorns/uds-core/issues/810)) ([eedb551](https://github.com/defenseunicorns/uds-core/commit/eedb551b3c5529c64dcb997b2eb33f82e5fbd0ab))
* **deps:** update istio to v1.23.2 ([#796](https://github.com/defenseunicorns/uds-core/issues/796)) ([039d89c](https://github.com/defenseunicorns/uds-core/commit/039d89c347089edff3d1b8ac7b85c8c90f20f722))
* **deps:** update keycloak to v25.0.6 ([#771](https://github.com/defenseunicorns/uds-core/issues/771)) ([9864059](https://github.com/defenseunicorns/uds-core/commit/9864059b3c86782978608f92782834ed493d5709))
* **deps:** update pepr to v0.13.1 ([#811](https://github.com/defenseunicorns/uds-core/issues/811)) ([bc05b04](https://github.com/defenseunicorns/uds-core/commit/bc05b0480de6c4abca35f774e7aba769a8c9f76e))
* **deps:** update prometheus operator to v0.77.0 ([#783](https://github.com/defenseunicorns/uds-core/issues/783)) ([8f383d8](https://github.com/defenseunicorns/uds-core/commit/8f383d84c13af3986e3898f4c57a71a49145053e))
* **deps:** update runtime to v0.5.0 ([#834](https://github.com/defenseunicorns/uds-core/issues/834)) ([edc068d](https://github.com/defenseunicorns/uds-core/commit/edc068d38f47ba373877593b854d21c4e4fc39ca))
* **deps:** update setup-node to v4.0.4 ([#801](https://github.com/defenseunicorns/uds-core/issues/801)) ([34dbc44](https://github.com/defenseunicorns/uds-core/commit/34dbc4426a65bc67e0a81779b530e98240e1972f))
* **deps:** update uds to v0.16.0 ([#802](https://github.com/defenseunicorns/uds-core/issues/802)) ([d07670b](https://github.com/defenseunicorns/uds-core/commit/d07670b6f748774df7e663aae89de3c7f0a87088))
* **deps:** update uds-common to v0.13.0 ([#792](https://github.com/defenseunicorns/uds-core/issues/792)) ([c24e833](https://github.com/defenseunicorns/uds-core/commit/c24e833e54b111cef10d6347c972c6d6fbe3e7ee))
* **deps:** update zarf to v0.40.1 ([#793](https://github.com/defenseunicorns/uds-core/issues/793)) ([db93a7e](https://github.com/defenseunicorns/uds-core/commit/db93a7edc2a83841210612430ad2d5fd46a14f97))
* fix github-actions renovate ([#800](https://github.com/defenseunicorns/uds-core/issues/800)) ([3ab2add](https://github.com/defenseunicorns/uds-core/commit/3ab2adda290463a91ec90f125793dd34cde76471))
* pepr policies doc table ([#803](https://github.com/defenseunicorns/uds-core/issues/803)) ([440e4e1](https://github.com/defenseunicorns/uds-core/commit/440e4e1249d94932c36d1964d1ff6166624c8f82))
* pepr policy doc ([#814](https://github.com/defenseunicorns/uds-core/issues/814)) ([8b10b86](https://github.com/defenseunicorns/uds-core/commit/8b10b864efb9822649b4677bcc4c3be1e7510534))
* updated pepr watch limit to 60s ([#840](https://github.com/defenseunicorns/uds-core/issues/840)) ([85f3f41](https://github.com/defenseunicorns/uds-core/commit/85f3f4155469e6997b18f27479937e938469a9bb))
* use kfc WatchPhase enum ([#787](https://github.com/defenseunicorns/uds-core/issues/787)) ([df4d2da](https://github.com/defenseunicorns/uds-core/commit/df4d2dadf6545d284c1fd72ee0291de4601fa533))

## [0.27.3](https://github.com/defenseunicorns/uds-core/compare/v0.27.2...v0.27.3) (2024-09-19)


### Miscellaneous

* add uds-runtime as an optional component in core ([#788](https://github.com/defenseunicorns/uds-core/issues/788)) ([a2dfede](https://github.com/defenseunicorns/uds-core/commit/a2dfede9eedb5a99265676437e40eab9eead5208))

## [0.27.2](https://github.com/defenseunicorns/uds-core/compare/v0.27.1...v0.27.2) (2024-09-18)


### Bug Fixes

* use boltdb-shipper store by default for loki ([#779](https://github.com/defenseunicorns/uds-core/issues/779)) ([e438e12](https://github.com/defenseunicorns/uds-core/commit/e438e12bef407587c67e2abf41ad26e3310cefd5))

## [0.27.1](https://github.com/defenseunicorns/uds-core/compare/v0.27.0...v0.27.1) (2024-09-18)


### Bug Fixes

* validate packages using full resource name ([#775](https://github.com/defenseunicorns/uds-core/issues/775)) ([678ed44](https://github.com/defenseunicorns/uds-core/commit/678ed4495fb3175ca722adb615fb19dfdec2f01d))


### Miscellaneous

* allow service ports to be overridden in test bundles ([#765](https://github.com/defenseunicorns/uds-core/issues/765)) ([5f9a920](https://github.com/defenseunicorns/uds-core/commit/5f9a92056258a64ef8f439e1ba73301fba2c407c))
* **deps:** update authservice to v1.0.2 ([#738](https://github.com/defenseunicorns/uds-core/issues/738)) ([3328b08](https://github.com/defenseunicorns/uds-core/commit/3328b08177723aa395bee7d9e3d27c28a1ab9121))
* **deps:** update githubactions ([#762](https://github.com/defenseunicorns/uds-core/issues/762)) ([c7bab2a](https://github.com/defenseunicorns/uds-core/commit/c7bab2a0609bc821489dd048f20e8c5032b8fa32))
* **deps:** update grafana curl image to v8.10.1 ([#773](https://github.com/defenseunicorns/uds-core/issues/773)) ([0d56ef2](https://github.com/defenseunicorns/uds-core/commit/0d56ef22a3ccf7725d4fd13e16aab97b9e6fdf2f))
* **deps:** update istio to v1.23.1 ([#744](https://github.com/defenseunicorns/uds-core/issues/744)) ([f222ea3](https://github.com/defenseunicorns/uds-core/commit/f222ea39e64e612ab082271ef8ac2d129a1014ad))
* **deps:** update neuvector chart to 2.7.9 ([#750](https://github.com/defenseunicorns/uds-core/issues/750)) ([a97b509](https://github.com/defenseunicorns/uds-core/commit/a97b50937fa790d8e894862c3d6969443701692e))
* **deps:** update neuvector updater image to v8.10.1 ([#774](https://github.com/defenseunicorns/uds-core/issues/774)) ([2afddfc](https://github.com/defenseunicorns/uds-core/commit/2afddfc6363c5a4663071083550af9695aa7ed5f))
* **deps:** update pepr to 0.36.0 ([#696](https://github.com/defenseunicorns/uds-core/issues/696)) ([2a1591e](https://github.com/defenseunicorns/uds-core/commit/2a1591e36ca681a976eb2c773090b538f8088563))
* **deps:** update prometheus-stack ([#743](https://github.com/defenseunicorns/uds-core/issues/743)) ([61f7a60](https://github.com/defenseunicorns/uds-core/commit/61f7a608856458062970baee62f415cd4e953f5a))
* **deps:** update test-infra random provider to v3.6.3 ([#753](https://github.com/defenseunicorns/uds-core/issues/753)) ([009326d](https://github.com/defenseunicorns/uds-core/commit/009326da3af36b6218736844465e5698e3d33819))
* **deps:** update uds-identity-config version to 0.6.3 ([#772](https://github.com/defenseunicorns/uds-core/issues/772)) ([a2ad936](https://github.com/defenseunicorns/uds-core/commit/a2ad936d509b04dd2f3e3d591839bff7715eae21))
* **deps:** update uds-k3d to v0.9.0 (1.30.4 k3s), k3d to 5.7.4 ([#770](https://github.com/defenseunicorns/uds-core/issues/770)) ([20656e6](https://github.com/defenseunicorns/uds-core/commit/20656e65856d573dee41fdd79a9fe3d962d0eac0))
* **deps:** update velero kubectl image to v1.31.1 ([#763](https://github.com/defenseunicorns/uds-core/issues/763)) ([56b3a21](https://github.com/defenseunicorns/uds-core/commit/56b3a21728da1838476bb35e6402a86dbe127244))
* **deps:** update velero kubectl to v1.31.1 ([#757](https://github.com/defenseunicorns/uds-core/issues/757)) ([c15d77e](https://github.com/defenseunicorns/uds-core/commit/c15d77e94d4a0e9c85f4b1017875a71ce0b5fa24))
* remove unused neuvector exporter ([#768](https://github.com/defenseunicorns/uds-core/issues/768)) ([bd4f5cf](https://github.com/defenseunicorns/uds-core/commit/bd4f5cff79cb95d59c82a4a185f5d52573838fed))
* task for custom pepr ([#766](https://github.com/defenseunicorns/uds-core/issues/766)) ([e624d73](https://github.com/defenseunicorns/uds-core/commit/e624d73f79bd6739b6808fbdbf5ca75ebb7c1d3c))

## [0.27.0](https://github.com/defenseunicorns/uds-core/compare/v0.26.1...v0.27.0) (2024-09-11)


### Features

* add support for Keycloak attribute `saml.assertion.signature` ([#723](https://github.com/defenseunicorns/uds-core/issues/723)) ([0e1a3da](https://github.com/defenseunicorns/uds-core/commit/0e1a3da76c68318ffdd5e9b188a2a2970bf098f9))
* investigate and restrict network policies ([#719](https://github.com/defenseunicorns/uds-core/issues/719)) ([b6ebc49](https://github.com/defenseunicorns/uds-core/commit/b6ebc4945f6eef132b3ae33fec106b4cb275574a))
* protocol mappers ([#621](https://github.com/defenseunicorns/uds-core/issues/621)) ([d71cb44](https://github.com/defenseunicorns/uds-core/commit/d71cb447a00f95a5198f21e50cc627516dac32ae))


### Bug Fixes

* correct keycloak chart schema for additionalGateways ([#745](https://github.com/defenseunicorns/uds-core/issues/745)) ([1fd8ef3](https://github.com/defenseunicorns/uds-core/commit/1fd8ef31d5ee33455d5cbefa027cbdf6dd7dcdd7))
* default `ctx.allowPrivilegeEscalation` to `false` if `undefined` ([#698](https://github.com/defenseunicorns/uds-core/issues/698)) ([7ecd130](https://github.com/defenseunicorns/uds-core/commit/7ecd130a84a5197842cfe96d4eec9791f07aced5))
* pre-commit linting ([#703](https://github.com/defenseunicorns/uds-core/issues/703)) ([c3a2f62](https://github.com/defenseunicorns/uds-core/commit/c3a2f62f1d56381717562f76558b54bd63812706))
* switch secret `data` to `stringData` ([#710](https://github.com/defenseunicorns/uds-core/issues/710)) ([9323d4e](https://github.com/defenseunicorns/uds-core/commit/9323d4e4eb82577d86718dbdca645a34fe765ccb))
* update ci workflows for docs shim ([#700](https://github.com/defenseunicorns/uds-core/issues/700)) ([5d89254](https://github.com/defenseunicorns/uds-core/commit/5d89254038cccda7c96203cc7ee0ec6f32b76af6))


### Miscellaneous

* adding uds core prerequisites documentation ([#636](https://github.com/defenseunicorns/uds-core/issues/636)) ([6225766](https://github.com/defenseunicorns/uds-core/commit/622576624307e6713703ebb025ecb624e812e812))
* **deps:** update dependency weaveworks/eksctl to v0.190.0 ([#721](https://github.com/defenseunicorns/uds-core/issues/721)) ([16d208a](https://github.com/defenseunicorns/uds-core/commit/16d208aeb9f4164f1daff1496e4e923050cb1d8a))
* **deps:** update githubactions ([#642](https://github.com/defenseunicorns/uds-core/issues/642)) ([0705ba6](https://github.com/defenseunicorns/uds-core/commit/0705ba64ba27aab4d67fa56a6a816ce83636a5ba))
* **deps:** update grafana curl image to v8.10.0 ([#751](https://github.com/defenseunicorns/uds-core/issues/751)) ([0cdb020](https://github.com/defenseunicorns/uds-core/commit/0cdb0207d2295bd1680c384625945e4077de7662))
* **deps:** update grafana sidecar image to v1.27.6 ([#732](https://github.com/defenseunicorns/uds-core/issues/732)) ([ad4808b](https://github.com/defenseunicorns/uds-core/commit/ad4808b167c59f41d834b1ce97606834dc6b77a7))
* **deps:** update grafana to 11.2.0 ([#670](https://github.com/defenseunicorns/uds-core/issues/670)) ([84e099a](https://github.com/defenseunicorns/uds-core/commit/84e099a172aa1612c1778d9943b966bf653659a6))
* **deps:** update istio to v1.23.0 ([#672](https://github.com/defenseunicorns/uds-core/issues/672)) ([3266a3a](https://github.com/defenseunicorns/uds-core/commit/3266a3a2190e4ddc964ba919495fa5c3cb162792))
* **deps:** update keycloak chart version to v25 ([#470](https://github.com/defenseunicorns/uds-core/issues/470)) ([3e805e7](https://github.com/defenseunicorns/uds-core/commit/3e805e729e2f6dd3b37c4697b496d0c091a9efe6))
* **deps:** update keycloak to 25.0.5 (https://github.com/defenseunicorns/uds-core/pull/742) ([45c540a](https://github.com/defenseunicorns/uds-core/commit/45c540ab1247639ef429e0c6bd338a3ecde9a01c))
* **deps:** update loki memcached images to v1.6.31 ([#752](https://github.com/defenseunicorns/uds-core/issues/752)) ([f94daf1](https://github.com/defenseunicorns/uds-core/commit/f94daf1e2ce7c9763a5367e028533a5cd46b9a17))
* **deps:** update metrics-server to v0.7.2 ([#708](https://github.com/defenseunicorns/uds-core/issues/708)) ([53f1bfd](https://github.com/defenseunicorns/uds-core/commit/53f1bfd888d96e9998875c1f9853451e819fc3a2))
* **deps:** update prometheus-stack ([#437](https://github.com/defenseunicorns/uds-core/issues/437)) ([526aab1](https://github.com/defenseunicorns/uds-core/commit/526aab119239e4b182f83a1cc739d7c8b0d26e48))
* **deps:** update prometheus-stack chart to v62.6.0 ([#740](https://github.com/defenseunicorns/uds-core/issues/740)) ([424570d](https://github.com/defenseunicorns/uds-core/commit/424570dbe9b33e1e6c013fb520d5355102da2e51))
* **deps:** update promtail helm chart to v6.16.5 ([#706](https://github.com/defenseunicorns/uds-core/issues/706)) ([4689d54](https://github.com/defenseunicorns/uds-core/commit/4689d54033d5bc8a023c511364793b8a2db69f12))
* **deps:** update uds cli to v0.14.2 ([#697](https://github.com/defenseunicorns/uds-core/issues/697)) ([f92bf53](https://github.com/defenseunicorns/uds-core/commit/f92bf5361d90819d96b4aaf53c3a2ed6d78ebe1d))
* **deps:** update uds to v0.15.0 ([#733](https://github.com/defenseunicorns/uds-core/issues/733)) ([57e0e64](https://github.com/defenseunicorns/uds-core/commit/57e0e643df18c1b76ec7f8bdb36e4f29becd95af))
* **deps:** update velero ([#695](https://github.com/defenseunicorns/uds-core/issues/695)) ([c188393](https://github.com/defenseunicorns/uds-core/commit/c1883932511113609319db9a943d6e25f005343c))
* **deps:** update velero chart to 7.2.1, kubectl image for unicorn flavor ([#725](https://github.com/defenseunicorns/uds-core/issues/725)) ([a98bac4](https://github.com/defenseunicorns/uds-core/commit/a98bac47e969188854a759013081e101e873a146))
* **deps:** update velero helm chart to v7.2.0 ([#720](https://github.com/defenseunicorns/uds-core/issues/720)) ([6309882](https://github.com/defenseunicorns/uds-core/commit/6309882b95fe071c4d83acc979b75d6529dcdb77))
* **deps:** update zarf to v0.39.0 ([#731](https://github.com/defenseunicorns/uds-core/issues/731)) ([7268680](https://github.com/defenseunicorns/uds-core/commit/7268680d740e4a2f70a450a36344167c4a3b57f2))
* update configure policy exemptions doc link ([#739](https://github.com/defenseunicorns/uds-core/issues/739)) ([6ad1256](https://github.com/defenseunicorns/uds-core/commit/6ad1256659b912e46677327ab1bd75a1b02ecf99))
* update loki to 3.1.1 ([#449](https://github.com/defenseunicorns/uds-core/issues/449)) ([e61da27](https://github.com/defenseunicorns/uds-core/commit/e61da27cfb028d020683a06b63f4c4fc210d5551))
* update renovate config/values to match all neuvector images ([#755](https://github.com/defenseunicorns/uds-core/issues/755)) ([72a97ba](https://github.com/defenseunicorns/uds-core/commit/72a97ba0db579298ced7fdc4bcf5315e8996d58a))
* update resources for prometheus, document resource overrides ([#713](https://github.com/defenseunicorns/uds-core/issues/713)) ([e80c1a4](https://github.com/defenseunicorns/uds-core/commit/e80c1a4740e72db583f9999c37360c88f9f21e3b))
* update to keycloak 25 ([#707](https://github.com/defenseunicorns/uds-core/issues/707)) ([0551aa5](https://github.com/defenseunicorns/uds-core/commit/0551aa52e437daf8c774842e513b7f38ff19ea1a))

## [0.26.1](https://github.com/defenseunicorns/uds-core/compare/v0.26.0...v0.26.1) (2024-08-23)


### Bug Fixes

* add additional supported saml attributes ([#690](https://github.com/defenseunicorns/uds-core/issues/690)) ([a7435bf](https://github.com/defenseunicorns/uds-core/commit/a7435bf9073263cd4a7155d7d385735ffb0e5cae))


### Miscellaneous

* **deps:** update dependency defenseunicorns/uds-common to v0.12.0 ([#692](https://github.com/defenseunicorns/uds-core/issues/692)) ([a5423a3](https://github.com/defenseunicorns/uds-core/commit/a5423a3fd537925f7a1c87ad04d9da352afe765a))
* **deps:** update test-infra to v0.0.6 ([#686](https://github.com/defenseunicorns/uds-core/issues/686)) ([8341e6e](https://github.com/defenseunicorns/uds-core/commit/8341e6ed5ec00e52278995570b877d6a497c7f1b))
* **deps:** update uds-common to v0.12.0 ([#693](https://github.com/defenseunicorns/uds-core/issues/693)) ([957f388](https://github.com/defenseunicorns/uds-core/commit/957f38898781196ffe257f2b64c0f845dddb738a))
* **deps:** update zarf to v0.38.3 ([#694](https://github.com/defenseunicorns/uds-core/issues/694)) ([c53126f](https://github.com/defenseunicorns/uds-core/commit/c53126f2401604ab26d58a1cc567cb37f7addadf))

## [0.26.0](https://github.com/defenseunicorns/uds-core/compare/v0.25.2...v0.26.0) (2024-08-21)


### ⚠ BREAKING CHANGES

* client attribute allow list ([#676](https://github.com/defenseunicorns/uds-core/issues/676))

### Features

* **azure:** azure blob storage support for velero ([#644](https://github.com/defenseunicorns/uds-core/issues/644)) ([eff9a82](https://github.com/defenseunicorns/uds-core/commit/eff9a82f3cc70306e045bdebd0166c1e6e4d750d))
* support authservice with redis, switch to pepr helm chart ([#658](https://github.com/defenseunicorns/uds-core/issues/658)) ([e2fe58a](https://github.com/defenseunicorns/uds-core/commit/e2fe58a7d32e65a7001571b0eacf285a320a46b7))


### Bug Fixes

* client attribute allow list ([#676](https://github.com/defenseunicorns/uds-core/issues/676)) ([100321e](https://github.com/defenseunicorns/uds-core/commit/100321ed3f0cdf78ded5e61b15123999cdcadd71))
* handle client id names with special characters ([#659](https://github.com/defenseunicorns/uds-core/issues/659)) ([a84769e](https://github.com/defenseunicorns/uds-core/commit/a84769e8f2f9e51f1e47f528d31902d8c2cee2d7))
* pull lula main for threshold update ([#638](https://github.com/defenseunicorns/uds-core/issues/638)) ([5a34ce8](https://github.com/defenseunicorns/uds-core/commit/5a34ce823d68c6ed194b2b4bb965bc154cb801e5))
* release-please config bump minor pre-major ([#680](https://github.com/defenseunicorns/uds-core/issues/680)) ([3f824c1](https://github.com/defenseunicorns/uds-core/commit/3f824c1b049df5a808c41b334bbd316e6b890a72))


### Miscellaneous

* add watch config to exemption watch ([#682](https://github.com/defenseunicorns/uds-core/issues/682)) ([7714ff8](https://github.com/defenseunicorns/uds-core/commit/7714ff88ef7f96c9805625f6708553a1e5d70a9a))
* **deps:** update grafana helm chart to v8.4.4 ([#664](https://github.com/defenseunicorns/uds-core/issues/664)) ([77ea6f5](https://github.com/defenseunicorns/uds-core/commit/77ea6f5f7d736abcc2aba78006d16ee3dda430ef))
* **deps:** update pepr to 0.34.1 ([#654](https://github.com/defenseunicorns/uds-core/issues/654)) ([6d4655d](https://github.com/defenseunicorns/uds-core/commit/6d4655dd44660825ccac965ac3a6cfdf956010d3))
* **deps:** update promtail to v3.1.1 ([#657](https://github.com/defenseunicorns/uds-core/issues/657)) ([c009e5f](https://github.com/defenseunicorns/uds-core/commit/c009e5f819ca373d59375e32ad88c3f2fea61920))
* **deps:** update test-infra ([#412](https://github.com/defenseunicorns/uds-core/issues/412)) ([a4c8fe9](https://github.com/defenseunicorns/uds-core/commit/a4c8fe9237914ad26343437fd1adc776f5473d02))
* **deps:** update test-infra (kms) to v0.0.5 ([#667](https://github.com/defenseunicorns/uds-core/issues/667)) ([bd68637](https://github.com/defenseunicorns/uds-core/commit/bd68637b59981021c917922a613b5375226687f9))
* **deps:** update test-infra KMS to v0.0.4 ([#663](https://github.com/defenseunicorns/uds-core/issues/663)) ([3c30b9f](https://github.com/defenseunicorns/uds-core/commit/3c30b9ffca129bc8db1477a32aeb0df66958d508))
* **deps:** update uds to v0.14.1 ([#677](https://github.com/defenseunicorns/uds-core/issues/677)) ([12ec8a1](https://github.com/defenseunicorns/uds-core/commit/12ec8a1fea5304900495f230ae3907a5141473b4))
* **deps:** update velero kubectl image to v1.31.0 ([#669](https://github.com/defenseunicorns/uds-core/issues/669)) ([d6b2f12](https://github.com/defenseunicorns/uds-core/commit/d6b2f120df75e662b35e0be6ce050b7b4bc4c90a))
* **deps:** update velero to v7.1.5 ([#671](https://github.com/defenseunicorns/uds-core/issues/671)) ([10ab714](https://github.com/defenseunicorns/uds-core/commit/10ab714502f43769e65b1b8da58ddcf6ec4a41c8))
* **deps:** update zarf to v0.38.1 ([#616](https://github.com/defenseunicorns/uds-core/issues/616)) ([e0cb85d](https://github.com/defenseunicorns/uds-core/commit/e0cb85d8a28ecbf91080e5cf8d2c3797595a80df))
* **deps:** update zarf to v0.38.2 ([#668](https://github.com/defenseunicorns/uds-core/issues/668)) ([3328925](https://github.com/defenseunicorns/uds-core/commit/3328925a35ccbe91b23c847c8d78a18a34383aff))
* generate a schema for keycloak helm chart ([#627](https://github.com/defenseunicorns/uds-core/issues/627)) ([cf3a9e7](https://github.com/defenseunicorns/uds-core/commit/cf3a9e7eca66779a6c13604dacfe6b979d9806c9))
* mute pepr on deploy action for migrating to helm chart ([#683](https://github.com/defenseunicorns/uds-core/issues/683)) ([9d05ddd](https://github.com/defenseunicorns/uds-core/commit/9d05ddd5a3e009be7ef202701916d58c9e1ce0d0))
* **neuvector:** update source for unicorn images ([#675](https://github.com/defenseunicorns/uds-core/issues/675)) ([568efa2](https://github.com/defenseunicorns/uds-core/commit/568efa2df865901e0a36429c053f02c0b4fd7419))

## [0.25.2](https://github.com/defenseunicorns/uds-core/compare/v0.25.1...v0.25.2) (2024-08-09)


### Bug Fixes

* add backoff to operator retry mechanism ([#650](https://github.com/defenseunicorns/uds-core/issues/650)) ([52c97fd](https://github.com/defenseunicorns/uds-core/commit/52c97fdc1fd9f6e37dbe2fa4082db43402ba6cc8))
* network allows for core netpols ([#652](https://github.com/defenseunicorns/uds-core/issues/652)) ([e9b69e8](https://github.com/defenseunicorns/uds-core/commit/e9b69e809a486c8dc5777ee761530a423a47f11b))


### Miscellaneous

* allow for extra keycloak gateway usage with client certs ([#648](https://github.com/defenseunicorns/uds-core/issues/648)) ([7b1c474](https://github.com/defenseunicorns/uds-core/commit/7b1c4740d243c2b0c35a3708d36057f0e2eb9e53))
* **deps:** update dependency defenseunicorns/uds-common to v0.11.1 ([#647](https://github.com/defenseunicorns/uds-core/issues/647)) ([768aa1c](https://github.com/defenseunicorns/uds-core/commit/768aa1c3eb836ccd4e87bb4d597758cf67478d62))
* **deps:** update dependency defenseunicorns/uds-common to v0.11.2 ([#653](https://github.com/defenseunicorns/uds-core/issues/653)) ([f7d1ce8](https://github.com/defenseunicorns/uds-core/commit/f7d1ce8805971640b4b3eb018d64717a5bbd806a))
* **deps:** update grafana helm chart to v8.4.3 ([#660](https://github.com/defenseunicorns/uds-core/issues/660)) ([81c7af0](https://github.com/defenseunicorns/uds-core/commit/81c7af036d126f13f003432a691623b88e0cece5))
* **deps:** update grafana to 11.1.3 ([[#607](https://github.com/defenseunicorns/uds-core/issues/607)](https://github.com/defenseunicorns/uds-core/pull/607)) ([7b343ac](https://github.com/defenseunicorns/uds-core/commit/7b343ac301aaeab7c1928cf3b39b2c11f9c89993))
* **deps:** update neuvector to 5.3.4 ([#606](https://github.com/defenseunicorns/uds-core/issues/606)) ([526bff4](https://github.com/defenseunicorns/uds-core/commit/526bff4674552fe257977e5e9a559d67a5ca273c))
* **deps:** update pepr to 0.33.0 ([#588](https://github.com/defenseunicorns/uds-core/issues/588)) ([6eee8f0](https://github.com/defenseunicorns/uds-core/commit/6eee8f00e52c0831d2cf622631fc0f838a5ce374))
* update identity config to 0.6.0 ([#661](https://github.com/defenseunicorns/uds-core/issues/661)) ([469fed8](https://github.com/defenseunicorns/uds-core/commit/469fed8fa07d7b5548eb778ee157c9c302d8a511))

## [0.25.1](https://github.com/defenseunicorns/uds-core/compare/v0.25.0...v0.25.1) (2024-08-06)


### Bug Fixes

* switch metrics-server to optional everywhere ([#641](https://github.com/defenseunicorns/uds-core/issues/641)) ([43c5bd5](https://github.com/defenseunicorns/uds-core/commit/43c5bd5bff896e9fd65f5b878563672e3a22100b))


### Miscellaneous

* add debug logs for istio injection logic ([#602](https://github.com/defenseunicorns/uds-core/issues/602)) ([9075436](https://github.com/defenseunicorns/uds-core/commit/9075436c37c847bd06f7e527506ecd41e4c4db0e))
* add support for public clients and disabling standard auth flow ([#630](https://github.com/defenseunicorns/uds-core/issues/630)) ([38151d7](https://github.com/defenseunicorns/uds-core/commit/38151d74d245d0b56ea7325a69514a832d7cf496))
* **deps:** update dependency defenseunicorns/uds-common to v0.11.0 ([#617](https://github.com/defenseunicorns/uds-core/issues/617)) ([997cf37](https://github.com/defenseunicorns/uds-core/commit/997cf37250bd72930d053ea87bba8a56c6fe052b))
* **deps:** update dependency weaveworks/eksctl to v0.188.0 ([#623](https://github.com/defenseunicorns/uds-core/issues/623)) ([3081044](https://github.com/defenseunicorns/uds-core/commit/3081044eddd8b2d043d7039907945b67990718ed))
* **deps:** update uds to v0.14.0 ([#612](https://github.com/defenseunicorns/uds-core/issues/612)) ([7fe927e](https://github.com/defenseunicorns/uds-core/commit/7fe927e4e0df19acbf2975b8d9c9e3068e0f82c5))
* update codeowners ([#637](https://github.com/defenseunicorns/uds-core/issues/637)) ([eec5017](https://github.com/defenseunicorns/uds-core/commit/eec5017bad0a06b5e2b5f023b5a2602aaf20f789))

## [0.25.0](https://github.com/defenseunicorns/uds-core/compare/v0.24.1...v0.25.0) (2024-08-02)


### ⚠ BREAKING CHANGES

* change metric server to optional (https://github.com/defenseunicorns/uds-core/pull/611)

### Features

* add json logging for keycloak ([#610](https://github.com/defenseunicorns/uds-core/issues/610)) ([29ed934](https://github.com/defenseunicorns/uds-core/commit/29ed934859c31dd557788f182a06736c5249f384))
* **istio:** add configurable TLS version ([#624](https://github.com/defenseunicorns/uds-core/issues/624)) ([cd2b87e](https://github.com/defenseunicorns/uds-core/commit/cd2b87e1819153df1c025afe0d3f7a3392e32217))


### Bug Fixes

* account for keycloak HA ports ([#619](https://github.com/defenseunicorns/uds-core/issues/619)) ([434f349](https://github.com/defenseunicorns/uds-core/commit/434f349fe6fda234875622a93de3939d0082eb78))
* add google saml to slim-dev ([#613](https://github.com/defenseunicorns/uds-core/issues/613)) ([f2164e1](https://github.com/defenseunicorns/uds-core/commit/f2164e10aae0a87dbd73cfe189f1154f850895e3))
* address network policy generation inter-namespace bug ([#564](https://github.com/defenseunicorns/uds-core/issues/564)) ([9b14c2c](https://github.com/defenseunicorns/uds-core/commit/9b14c2ca31d7c05540dcfdfff7247bb31ed6b924))
* reference root scope ([#633](https://github.com/defenseunicorns/uds-core/issues/633)) ([5de6915](https://github.com/defenseunicorns/uds-core/commit/5de69159f1f8370fc6b5553c2b9b05af52621027))


### Miscellaneous

* change metric server to optional (https://github.com/defenseunicorns/uds-core/pull/611) ([bc2d673](https://github.com/defenseunicorns/uds-core/commit/bc2d673b81724449a6c7523b1ba6950009c0c888))
* **deps:** update dependency defenseunicorns/uds-common to v0.9.0 ([#592](https://github.com/defenseunicorns/uds-core/issues/592)) ([44ea2d7](https://github.com/defenseunicorns/uds-core/commit/44ea2d7db07b1b91318ec5a8d6b048c3c8f3a565))
* **deps:** update dependency weaveworks/eksctl to v0.187.0 ([#539](https://github.com/defenseunicorns/uds-core/issues/539)) ([9002a94](https://github.com/defenseunicorns/uds-core/commit/9002a945bbe7f9e9f75ca3f3909ffecedbbc995a))
* **deps:** update githubactions ([#553](https://github.com/defenseunicorns/uds-core/issues/553)) ([2a9e29a](https://github.com/defenseunicorns/uds-core/commit/2a9e29aa506dffc1c8db5b5fc2272ffc974a0988))
* **deps:** update grafana curl image to v8.9.0 ([#596](https://github.com/defenseunicorns/uds-core/issues/596)) ([64f9408](https://github.com/defenseunicorns/uds-core/commit/64f9408fb792b931b4eddc4669559d8f99aab7dc))
* **deps:** update grafana helm chart to v8.3.6 ([#594](https://github.com/defenseunicorns/uds-core/issues/594)) ([1f2005b](https://github.com/defenseunicorns/uds-core/commit/1f2005bff139a1738c6cf217d79c0c6396e1a347))
* **deps:** update istio to v1.22.3 ([#580](https://github.com/defenseunicorns/uds-core/issues/580)) ([7aba89e](https://github.com/defenseunicorns/uds-core/commit/7aba89e8951b27f26495c6b13fbe25b02808ee19))
* **deps:** update lula to v0.4.4 ([#615](https://github.com/defenseunicorns/uds-core/issues/615)) ([b02b305](https://github.com/defenseunicorns/uds-core/commit/b02b305fdac5e415af1b78668f45fdde7be4b67a))
* **deps:** update neuvector-updater/curl to v8.9.0 ([#597](https://github.com/defenseunicorns/uds-core/issues/597)) ([b4bd660](https://github.com/defenseunicorns/uds-core/commit/b4bd66086b217871b17cadcff7bd1617c829279d))
* **deps:** update promtail configmap-reload to v0.13.1 ([#608](https://github.com/defenseunicorns/uds-core/issues/608)) ([d98bbae](https://github.com/defenseunicorns/uds-core/commit/d98bbae27de52b9ece2981b79d5bd6ba2b09d5e0))
* **deps:** update promtail helm chart to v6.16.4 ([#574](https://github.com/defenseunicorns/uds-core/issues/574)) ([bf9f65c](https://github.com/defenseunicorns/uds-core/commit/bf9f65ca482da38c6cd09a6a519d545511326d43))
* **deps:** update to identity-config 0.5.2 ([#635](https://github.com/defenseunicorns/uds-core/issues/635)) ([6474d16](https://github.com/defenseunicorns/uds-core/commit/6474d16eb0cc6f08f2d4c35e9d642add62c6ae34))
* **deps:** update uds cli to v0.13.1 ([#569](https://github.com/defenseunicorns/uds-core/issues/569)) ([4339c89](https://github.com/defenseunicorns/uds-core/commit/4339c892c56bdcabf7809cde7c7898348c1d9132))
* **deps:** update zarf to v0.36.1 ([#562](https://github.com/defenseunicorns/uds-core/issues/562)) ([058cfb3](https://github.com/defenseunicorns/uds-core/commit/058cfb3b45d9f944e2f2c615fef82ae1a98d2413))
* disable telemetry/analytics for loki/grafana ([#601](https://github.com/defenseunicorns/uds-core/issues/601)) ([ad785bc](https://github.com/defenseunicorns/uds-core/commit/ad785bcac2e11ccdc4fbdb14bee9bb1fdbd536cb))
* update zarf to new repo location, 0.37.0 ([#631](https://github.com/defenseunicorns/uds-core/issues/631)) ([29f9fd0](https://github.com/defenseunicorns/uds-core/commit/29f9fd0277bc0ab4cd6073e4c5b73123586946e1))

## [0.24.1](https://github.com/defenseunicorns/uds-core/compare/v0.24.0...v0.24.1) (2024-07-22)


### Bug Fixes

* **ci:** snapshot release publish, passthrough test on upgrade ([#575](https://github.com/defenseunicorns/uds-core/issues/575)) ([d4afe00](https://github.com/defenseunicorns/uds-core/commit/d4afe0065b76ec7c44e9d00b1f95b46b189043f0))
* **ci:** workflow permissions ([cacf1b5](https://github.com/defenseunicorns/uds-core/commit/cacf1b5d8bccd16a8c2381fbd0912715a78a22c2))
* only allow istio gateways to set x509 client certificate header ([#572](https://github.com/defenseunicorns/uds-core/issues/572)) ([5c62279](https://github.com/defenseunicorns/uds-core/commit/5c622795b9becb7ef6f65b807486ade0fd44bea1))
* **sso:** delete orphaned SSO secrets ([#578](https://github.com/defenseunicorns/uds-core/issues/578)) ([5a6b9ef](https://github.com/defenseunicorns/uds-core/commit/5a6b9effca83f4f19344c813cf96d474ff5fdeb4))
* unicorn flavor proxy image reference ([#590](https://github.com/defenseunicorns/uds-core/issues/590)) ([db081fa](https://github.com/defenseunicorns/uds-core/commit/db081fa41c0db6557c3b66bbfa0b5064dc7226e3))
* update monitor mutation to not overwrite explicitly defined scrape class ([#582](https://github.com/defenseunicorns/uds-core/issues/582)) ([7e550d3](https://github.com/defenseunicorns/uds-core/commit/7e550d3577546d73e32a62dac018e048972d46eb))


### Miscellaneous

* **deps:** update grafana chart + sidecar image ([#567](https://github.com/defenseunicorns/uds-core/issues/567)) ([85b6de4](https://github.com/defenseunicorns/uds-core/commit/85b6de4b140a2076cdc72626bce2d24aab90c26c))
* **deps:** update pepr to v0.32.7 ([#556](https://github.com/defenseunicorns/uds-core/issues/556)) ([e594f13](https://github.com/defenseunicorns/uds-core/commit/e594f1366bb6a920a9cd7a945bc41ae39382f8b8))
* **deps:** update uds-identity-config to v0.5.1 ([#591](https://github.com/defenseunicorns/uds-core/issues/591)) ([b9c5bd3](https://github.com/defenseunicorns/uds-core/commit/b9c5bd34c75b6fe7063d8bf4bd15496f73e87861))
* **deps:** update uds-k3d to v0.8.0 ([#581](https://github.com/defenseunicorns/uds-core/issues/581)) ([fab8919](https://github.com/defenseunicorns/uds-core/commit/fab89198a9118f51e372b589e02fca89d6db4112))
* **loki:** default query settings, config as secret ([#579](https://github.com/defenseunicorns/uds-core/issues/579)) ([5fa889c](https://github.com/defenseunicorns/uds-core/commit/5fa889c51a59786330fd4f7b914b532b4c56b1b3))
* **oscal:** begin integration of composed oscal with validations ([#496](https://github.com/defenseunicorns/uds-core/issues/496)) ([047fd30](https://github.com/defenseunicorns/uds-core/commit/047fd3041a8eecc29c8f61e1f3c2c70622ec9e88))

## [0.24.0](https://github.com/defenseunicorns/uds-core/compare/v0.23.0...v0.24.0) (2024-07-12)


### ⚠ BREAKING CHANGES

* set istio passthrough gateway as optional component (https://github.com/defenseunicorns/uds-core/pull/547)

### Features

* add unicorn flavor to uds-core ([#507](https://github.com/defenseunicorns/uds-core/issues/507)) ([a412581](https://github.com/defenseunicorns/uds-core/commit/a412581c6295658cd61a8f4fc182357c0780bef6))
* added standalone dns service for loki ([#548](https://github.com/defenseunicorns/uds-core/issues/548)) ([e2efdf9](https://github.com/defenseunicorns/uds-core/commit/e2efdf9b059f698369721412409509cc702593bc))
* enable authservice integration ([#201](https://github.com/defenseunicorns/uds-core/issues/201)) ([1d4df64](https://github.com/defenseunicorns/uds-core/commit/1d4df64d12882b9a4ff01b5144c1edc7fc2351d2))
* set istio passthrough gateway as optional component (https://github.com/defenseunicorns/uds-core/pull/547) ([e1cab61](https://github.com/defenseunicorns/uds-core/commit/e1cab61a170dff73fa97000f922cc373a0a70ee5))
* update to using default scrapeclass for tls config ([#517](https://github.com/defenseunicorns/uds-core/issues/517)) ([258bb6b](https://github.com/defenseunicorns/uds-core/commit/258bb6b41a07081412393b625438c5634ae88d79))


### Bug Fixes

* decouple `devMode` and postgres egress ([#554](https://github.com/defenseunicorns/uds-core/issues/554)) ([1a98779](https://github.com/defenseunicorns/uds-core/commit/1a987796edab5929f90973944bd3888670342973))
* grafana logout not working in some environments ([#559](https://github.com/defenseunicorns/uds-core/issues/559)) ([ccb9d9e](https://github.com/defenseunicorns/uds-core/commit/ccb9d9e0670a477cdcd87f435db85f0c76e1ccda))
* initial creation of child logging ([#533](https://github.com/defenseunicorns/uds-core/issues/533)) ([00a5140](https://github.com/defenseunicorns/uds-core/commit/00a5140df6205143d89c15249eb28b3502a2c901))
* podmonitor mTLS mutations ([#566](https://github.com/defenseunicorns/uds-core/issues/566)) ([eb613e1](https://github.com/defenseunicorns/uds-core/commit/eb613e1ad462681248b85778173d65d9358d427f))


### Miscellaneous

* add util function for purging orphans ([#565](https://github.com/defenseunicorns/uds-core/issues/565)) ([e84229a](https://github.com/defenseunicorns/uds-core/commit/e84229ad355b60935dc077bb23f1c91f0fa212ec))
* allow istio proxy injection in zarf ignored namespaces (https://github.com/defenseunicorns/uds-core/pull/513) ([8921b58](https://github.com/defenseunicorns/uds-core/commit/8921b5897b7a34d9065417f66c1cc24817116ba2))
* **deps:** update githubactions upload-artifact to v4.3.4 ([#543](https://github.com/defenseunicorns/uds-core/issues/543)) ([20889f2](https://github.com/defenseunicorns/uds-core/commit/20889f2936597360c91b067d2c0d07d6c94646a4))
* **deps:** update grafana helm chart to v8.3.2 ([#542](https://github.com/defenseunicorns/uds-core/issues/542)) ([8ec260c](https://github.com/defenseunicorns/uds-core/commit/8ec260c7644241fb7fe8163ea8b74240320d417e))
* **deps:** update pepr dependencies (jest, uds-common) ([#537](https://github.com/defenseunicorns/uds-core/issues/537)) ([547c0bf](https://github.com/defenseunicorns/uds-core/commit/547c0bfb5197fb129e023d2d02fa3a306790364a))
* **deps:** update promtail helm chart to v6.16.3 ([#538](https://github.com/defenseunicorns/uds-core/issues/538)) ([48b3fea](https://github.com/defenseunicorns/uds-core/commit/48b3feac221f90316e025b57151d8241dbd455c4))

## [0.23.0](https://github.com/defenseunicorns/uds-core/compare/v0.22.2...v0.23.0) (2024-07-04)


### ⚠ BREAKING CHANGES

* remove emulated gitlab endpoints from keycloak ([#483](https://github.com/defenseunicorns/uds-core/issues/483))

### Features

* identity group auth ([#497](https://github.com/defenseunicorns/uds-core/issues/497)) ([d71d83e](https://github.com/defenseunicorns/uds-core/commit/d71d83ed4d6e6a35724e70fc5a27cb7ff6e1adaa))


### Bug Fixes

* **docs:** re-ordered small paragraphs, clarified wording, and added links to tech homepages ([#531](https://github.com/defenseunicorns/uds-core/issues/531)) ([6b2b46b](https://github.com/defenseunicorns/uds-core/commit/6b2b46b46dcb0d25bc13ca7e166bba4fb531da15))
* **docs:** removed double-link which broke the markdown formatting in pr template ([#532](https://github.com/defenseunicorns/uds-core/issues/532)) ([f41ced4](https://github.com/defenseunicorns/uds-core/commit/f41ced483cc8f8ca1f2cfba3ae3fb58a218f7afc))
* **docs:** uds-config.yaml example in k3d-slim-dev README ([#530](https://github.com/defenseunicorns/uds-core/issues/530)) ([2e1c53e](https://github.com/defenseunicorns/uds-core/commit/2e1c53e939b99794c8e6994f20282974bd139917))
* operator retries and error logging ([#511](https://github.com/defenseunicorns/uds-core/issues/511)) ([cae5aab](https://github.com/defenseunicorns/uds-core/commit/cae5aabed589d28680f0f36bd4afe8e2d235c8b4))


### Miscellaneous

* **deps:** update checkout action to latest sha ([#481](https://github.com/defenseunicorns/uds-core/issues/481)) ([c6f0137](https://github.com/defenseunicorns/uds-core/commit/c6f0137bb9a1e11f98d426cec8c98eb4005f160a))
* **deps:** update dependency weaveworks/eksctl to v0.183.0 ([#499](https://github.com/defenseunicorns/uds-core/issues/499)) ([9cb8e4d](https://github.com/defenseunicorns/uds-core/commit/9cb8e4d7c86611918e502de0a7e7e25921523cbc))
* **deps:** update grafana to 11.1.0 ([#380](https://github.com/defenseunicorns/uds-core/issues/380)) ([499058a](https://github.com/defenseunicorns/uds-core/commit/499058aedbbda33f88fffd94178ceb68529d5c85))
* **deps:** update istio to v1.22.2 ([#512](https://github.com/defenseunicorns/uds-core/issues/512)) ([dcdadb4](https://github.com/defenseunicorns/uds-core/commit/dcdadb49255a5052dcb3fe079335976b758b32f9))
* **deps:** update jest to v29.1.5 ([#485](https://github.com/defenseunicorns/uds-core/issues/485)) ([9c392b9](https://github.com/defenseunicorns/uds-core/commit/9c392b9b88c84e3c3763878e6beb1800c43ded25))
* **deps:** update neuvector to 5.3.3 ([#467](https://github.com/defenseunicorns/uds-core/issues/467)) ([261057d](https://github.com/defenseunicorns/uds-core/commit/261057d2bf142c3167fdf0d0bd68bc2fb47d22df))
* **deps:** update pepr to 0.32.2 ([#473](https://github.com/defenseunicorns/uds-core/issues/473)) ([ab4bee9](https://github.com/defenseunicorns/uds-core/commit/ab4bee906f020d86b90c0b984789be55f8b4c08b))
* **deps:** update pepr to 0.32.3 ([#494](https://github.com/defenseunicorns/uds-core/issues/494)) ([2e28897](https://github.com/defenseunicorns/uds-core/commit/2e2889784043b21463e72643eb890054645dd439))
* **deps:** update pepr to 0.32.6 ([#516](https://github.com/defenseunicorns/uds-core/issues/516)) ([a9d3eec](https://github.com/defenseunicorns/uds-core/commit/a9d3eecce3e007958b45ac2e627cbece84ad48ac))
* **deps:** update promtail to 3.1.0 ([#335](https://github.com/defenseunicorns/uds-core/issues/335)) ([4457fce](https://github.com/defenseunicorns/uds-core/commit/4457fce6f46626047e37a17b87dbdc675bcfd709))
* **deps:** update uds to v0.12.0 ([#521](https://github.com/defenseunicorns/uds-core/issues/521)) ([8e587ff](https://github.com/defenseunicorns/uds-core/commit/8e587ffc210bdb2351748383e058cf86ced8b7a9))
* **deps:** update uds-common tasks to 0.6.1 ([#498](https://github.com/defenseunicorns/uds-core/issues/498)) ([4aa6e33](https://github.com/defenseunicorns/uds-core/commit/4aa6e3372f6d1a5df1e2ae51a3129603a8b0b29b))
* **deps:** update zarf to v0.35.0 ([#490](https://github.com/defenseunicorns/uds-core/issues/490)) ([86957cf](https://github.com/defenseunicorns/uds-core/commit/86957cfe19564ec8ddccec7e496af4469def322a))
* docs linting changes ([#505](https://github.com/defenseunicorns/uds-core/issues/505)) ([0fe2015](https://github.com/defenseunicorns/uds-core/commit/0fe20151713363f572a50601016e06e60230990f))
* remove emulated gitlab endpoints from keycloak ([#483](https://github.com/defenseunicorns/uds-core/issues/483)) ([495960c](https://github.com/defenseunicorns/uds-core/commit/495960ce8d40cf2ef7c0f0021b653db6fc6383bb))
* update docs for group auth and readme for docs site ([#540](https://github.com/defenseunicorns/uds-core/issues/540)) ([ace7041](https://github.com/defenseunicorns/uds-core/commit/ace7041e500b72f00b4a5c23d7413a46aa359504))

## [0.22.2](https://github.com/defenseunicorns/uds-core/compare/v0.22.1...v0.22.2) (2024-06-13)


### Bug Fixes

* check if exemption exists before cleanup ([#468](https://github.com/defenseunicorns/uds-core/issues/468)) ([735288b](https://github.com/defenseunicorns/uds-core/commit/735288b87f2dff3c1bb28e9e20aac812d644aa4d))
* pepr operator derived netpol name collisions ([#480](https://github.com/defenseunicorns/uds-core/issues/480)) ([de60e25](https://github.com/defenseunicorns/uds-core/commit/de60e252526d73e439f5665b27f84e8773c24949))
* typo in comment ([#462](https://github.com/defenseunicorns/uds-core/issues/462)) ([582b1f4](https://github.com/defenseunicorns/uds-core/commit/582b1f4754ee3282696ea3b018322a1b3497a7d4))


### Miscellaneous

* **deps:** update checkout to v4.1.7 ([#478](https://github.com/defenseunicorns/uds-core/issues/478)) ([e91a0a3](https://github.com/defenseunicorns/uds-core/commit/e91a0a35252581554d9ed587e4ef72c2c88a3586))
* **deps:** update githubactions to v4.1.3 ([#471](https://github.com/defenseunicorns/uds-core/issues/471)) ([2a9f44d](https://github.com/defenseunicorns/uds-core/commit/2a9f44d20dce66fa474e47ba0c93eaa7fa9ad406))
* **deps:** update uds to v0.11.1 ([#472](https://github.com/defenseunicorns/uds-core/issues/472)) ([12fd798](https://github.com/defenseunicorns/uds-core/commit/12fd79894e71ee06181ccd6f2ac98b84d935066c))
* **deps:** update uds to v0.11.2 ([#479](https://github.com/defenseunicorns/uds-core/issues/479)) ([f967f9a](https://github.com/defenseunicorns/uds-core/commit/f967f9a4bf8d718b9ece96d882db4d9c800f5f0f))
* **deps:** update velero to v1.30.2 ([#476](https://github.com/defenseunicorns/uds-core/issues/476)) ([89bbda9](https://github.com/defenseunicorns/uds-core/commit/89bbda9e640014bede116c254381cab8995df12f))

## [0.22.1](https://github.com/defenseunicorns/uds-core/compare/v0.22.0...v0.22.1) (2024-06-06)


### Bug Fixes

* add saml configuration to k3d standard bundle ([#425](https://github.com/defenseunicorns/uds-core/issues/425)) ([15b41d7](https://github.com/defenseunicorns/uds-core/commit/15b41d7ca506dd913316c41321aa9a3133755ab4))
* de-duplicate renovate matches ([#435](https://github.com/defenseunicorns/uds-core/issues/435)) ([4f9dbbb](https://github.com/defenseunicorns/uds-core/commit/4f9dbbbff0bbe1fe348ae7e6c55f97a505f730a9))
* default keycloak realm envs ([#455](https://github.com/defenseunicorns/uds-core/issues/455)) ([3a2b48f](https://github.com/defenseunicorns/uds-core/commit/3a2b48fefb11afcf20f6826fbdef8c43daaf4639))
* exemption race conditions ([#407](https://github.com/defenseunicorns/uds-core/issues/407)) ([d1b3b56](https://github.com/defenseunicorns/uds-core/commit/d1b3b5669976eb23ca8f88cd5b15a12c56102eca))
* integrated docs ([#431](https://github.com/defenseunicorns/uds-core/issues/431)) ([72238fa](https://github.com/defenseunicorns/uds-core/commit/72238faed167a4e90e4d332e17909510efd98a58))
* keycloak schema for package cr ([#436](https://github.com/defenseunicorns/uds-core/issues/436)) ([e32ce9a](https://github.com/defenseunicorns/uds-core/commit/e32ce9af9176ba8fef702a8c6aac84c15f9ab374))
* networkpolicy for keycloak smtp egress ([4059954](https://github.com/defenseunicorns/uds-core/commit/4059954ed92502f10c1b5b769988a363adc06318))
* nightly testing eks config architecture ([#452](https://github.com/defenseunicorns/uds-core/issues/452)) ([a0bbd1f](https://github.com/defenseunicorns/uds-core/commit/a0bbd1f0bf84f03d59866f9797555a08dc8034d6))
* remove deprecated registry login and add env setup ([#443](https://github.com/defenseunicorns/uds-core/issues/443)) ([ca6b76f](https://github.com/defenseunicorns/uds-core/commit/ca6b76f3a66efb6b2e81832aff771ca06bdff68a))
* remove go mod ([#441](https://github.com/defenseunicorns/uds-core/issues/441)) ([0de9693](https://github.com/defenseunicorns/uds-core/commit/0de969333923afb8fd4639547901c7d7f5c6a6f7))
* remove no-tea and update uds version ([#446](https://github.com/defenseunicorns/uds-core/issues/446)) ([434844b](https://github.com/defenseunicorns/uds-core/commit/434844b827e01808b504abf5ee6af83fba813cb6))
* use updated k3s ([#426](https://github.com/defenseunicorns/uds-core/issues/426)) ([1da1c49](https://github.com/defenseunicorns/uds-core/commit/1da1c49e314c73e6fd1f2ef2940aff983262ec6b))


### Miscellaneous

* add checks before killing pods when updating istio annotations ([#457](https://github.com/defenseunicorns/uds-core/issues/457)) ([a62f9a0](https://github.com/defenseunicorns/uds-core/commit/a62f9a0e04bb538a8018a3f866c88e8b93c59826))
* add debug logs to save logs for easier searching ([#430](https://github.com/defenseunicorns/uds-core/issues/430)) ([319101b](https://github.com/defenseunicorns/uds-core/commit/319101b61e4793037aab6c96b92c9d834763e9b8))
* add velero csi plugin ([#424](https://github.com/defenseunicorns/uds-core/issues/424)) ([c7e49e9](https://github.com/defenseunicorns/uds-core/commit/c7e49e91d9f7810ddc0368f146d43d3c94c782ad))
* **deps:** update githubactions ([#413](https://github.com/defenseunicorns/uds-core/issues/413)) ([ebd834e](https://github.com/defenseunicorns/uds-core/commit/ebd834e56ae9adabe14d9772e4a4d9c305da173c))
* **deps:** update istio to v1.22.1 ([#405](https://github.com/defenseunicorns/uds-core/issues/405)) ([ad4b861](https://github.com/defenseunicorns/uds-core/commit/ad4b861158eecfac1d09a37ea3776e31a1c387cb))
* **deps:** update jest to v29.1.4 ([#438](https://github.com/defenseunicorns/uds-core/issues/438)) ([c3ecc8b](https://github.com/defenseunicorns/uds-core/commit/c3ecc8b83b8c65f09600ab937a1c140c4a5f7db1))
* **deps:** update keycloak to v0.4.4 ([#460](https://github.com/defenseunicorns/uds-core/issues/460)) ([936f40b](https://github.com/defenseunicorns/uds-core/commit/936f40bf078bb06d94ebd51585b4eb7669d426b4))
* **deps:** update keycloak to v0.4.5 ([#461](https://github.com/defenseunicorns/uds-core/issues/461)) ([3592012](https://github.com/defenseunicorns/uds-core/commit/35920121bcdfbdf9b708eb3308ea34763a31246a))
* **deps:** update keycloak to v24.0.5 ([#453](https://github.com/defenseunicorns/uds-core/issues/453)) ([6b0c6fc](https://github.com/defenseunicorns/uds-core/commit/6b0c6fc91f238e367c9f2d54f0daaf9d8065794e))
* **deps:** update keycloak to v24.0.5 ([#454](https://github.com/defenseunicorns/uds-core/issues/454)) ([89911f0](https://github.com/defenseunicorns/uds-core/commit/89911f0ca01ac421a254b79e25124525f464cf51))
* **deps:** update pepr ([#419](https://github.com/defenseunicorns/uds-core/issues/419)) ([d8f0309](https://github.com/defenseunicorns/uds-core/commit/d8f0309b4f9661b1c5bc2d5e574697ee9579e387))
* **deps:** update pepr to v0.4.5 ([#447](https://github.com/defenseunicorns/uds-core/issues/447)) ([f1dba17](https://github.com/defenseunicorns/uds-core/commit/f1dba17076a7c6052ed67e07bdb560fda7604b80))
* **deps:** update prometheus-stack ([#422](https://github.com/defenseunicorns/uds-core/issues/422)) ([a96193e](https://github.com/defenseunicorns/uds-core/commit/a96193e257701dfaf6fccc34246ef3f31e639f3e))
* **deps:** update uds-common to v0.4.4 ([#442](https://github.com/defenseunicorns/uds-core/issues/442)) ([bf6debd](https://github.com/defenseunicorns/uds-core/commit/bf6debdd0d50f6cde11288cd70d8bdf1dcdaaaa0))
* **deps:** update uds-k3d to v0.7.0 ([#428](https://github.com/defenseunicorns/uds-core/issues/428)) ([23b59a2](https://github.com/defenseunicorns/uds-core/commit/23b59a260b2c60791614ca4d39a33e65476e19ee))
* **deps:** update velero ([#408](https://github.com/defenseunicorns/uds-core/issues/408)) ([ffbefda](https://github.com/defenseunicorns/uds-core/commit/ffbefda74777466ef74ad1d5cffff1f4895f323d))
* **deps:** update velero ([#440](https://github.com/defenseunicorns/uds-core/issues/440)) ([4b1a3ea](https://github.com/defenseunicorns/uds-core/commit/4b1a3ead81a80b49e5ccfeb2e4130a4aaebb53a4))
* **deps:** update velero to v6.6.0 ([#456](https://github.com/defenseunicorns/uds-core/issues/456)) ([aff37c1](https://github.com/defenseunicorns/uds-core/commit/aff37c194e321f6a6c92f1bc11fd796cf9f0a9ab))
* **deps:** update zarf to v0.34.0 ([#434](https://github.com/defenseunicorns/uds-core/issues/434)) ([9badf9d](https://github.com/defenseunicorns/uds-core/commit/9badf9d4b9b6f904b1b7a478be5355416dc7fbe0))

## [0.22.0](https://github.com/defenseunicorns/uds-core/compare/v0.21.1...v0.22.0) (2024-05-22)


### Features

* add `expose` service entry for internal cluster traffic ([#356](https://github.com/defenseunicorns/uds-core/issues/356)) ([1bde4cc](https://github.com/defenseunicorns/uds-core/commit/1bde4ccf302864b0c38d093742ca683b96cebe89))
* add reconciliation retries for CRs ([#423](https://github.com/defenseunicorns/uds-core/issues/423)) ([424b57b](https://github.com/defenseunicorns/uds-core/commit/424b57ba91906e1c60e6e92927e37b34d657ad01))
* uds common renovate config ([#391](https://github.com/defenseunicorns/uds-core/issues/391)) ([035786c](https://github.com/defenseunicorns/uds-core/commit/035786cadcd9c1fbaf7e0a798f9c13104a1a9a14))
* uds core docs ([#414](https://github.com/defenseunicorns/uds-core/issues/414)) ([a35ca7b](https://github.com/defenseunicorns/uds-core/commit/a35ca7b484ab59572d8205a625db5447a8771e44))


### Bug Fixes

* mismatched exemption/policy for DropAllCapabilities ([#384](https://github.com/defenseunicorns/uds-core/issues/384)) ([d8ec278](https://github.com/defenseunicorns/uds-core/commit/d8ec27827e2e2e7d85b4eba6b738f4b126264dd9))
* pepr mutation annotation overwrite ([#385](https://github.com/defenseunicorns/uds-core/issues/385)) ([6e56b2a](https://github.com/defenseunicorns/uds-core/commit/6e56b2afec8f54f8c0a4aa4b89fef1d1c754b627))
* renovate config grouping, test-infra ([#411](https://github.com/defenseunicorns/uds-core/issues/411)) ([05fd407](https://github.com/defenseunicorns/uds-core/commit/05fd407e9c3bf6a0bac33de64e892ce2a63275ac))
* renovate pepr comment ([#410](https://github.com/defenseunicorns/uds-core/issues/410)) ([a825388](https://github.com/defenseunicorns/uds-core/commit/a82538817765ad21adb5f6bba283951bf4c23272))


### Miscellaneous

* **deps:** update keycloak ([#390](https://github.com/defenseunicorns/uds-core/issues/390)) ([3e82c4e](https://github.com/defenseunicorns/uds-core/commit/3e82c4ece470a5eea81d937b2b38c455934212e1))
* **deps:** update keycloak to v24.0.4 ([#397](https://github.com/defenseunicorns/uds-core/issues/397)) ([c0420ea](https://github.com/defenseunicorns/uds-core/commit/c0420ea750b3a7dfc8ea6adab5225f76178ef953))
* **deps:** update keycloak to v24.0.4 ([#402](https://github.com/defenseunicorns/uds-core/issues/402)) ([e454576](https://github.com/defenseunicorns/uds-core/commit/e454576a6de53e833d6b925308f09d6007166dde))
* **deps:** update neuvector to v9.4 ([#381](https://github.com/defenseunicorns/uds-core/issues/381)) ([20d4170](https://github.com/defenseunicorns/uds-core/commit/20d4170386d2437826abafc68d87d91dc457022a))
* **deps:** update pepr to 0.31.0 ([#360](https://github.com/defenseunicorns/uds-core/issues/360)) ([fbd61ea](https://github.com/defenseunicorns/uds-core/commit/fbd61ea9665133619aec81726b189449226d8459))
* **deps:** update prometheus-stack ([#348](https://github.com/defenseunicorns/uds-core/issues/348)) ([49cb11a](https://github.com/defenseunicorns/uds-core/commit/49cb11a058a9209cee7019fa552b8c0b2ef73368))
* **deps:** update prometheus-stack ([#392](https://github.com/defenseunicorns/uds-core/issues/392)) ([2e656f5](https://github.com/defenseunicorns/uds-core/commit/2e656f5dc3de2e6561ac313cb1bae478635b86b3))
* **deps:** update uds to v0.10.4 ([#228](https://github.com/defenseunicorns/uds-core/issues/228)) ([1750b23](https://github.com/defenseunicorns/uds-core/commit/1750b2304e3c6f0ce6a60f1ef2873ce8a6ce1502))
* **deps:** update uds-k3d to v0.6.0 ([#398](https://github.com/defenseunicorns/uds-core/issues/398)) ([288f009](https://github.com/defenseunicorns/uds-core/commit/288f00990a715087c9bf1fffd0a63ecf33125a5a))
* **deps:** update velero ([#350](https://github.com/defenseunicorns/uds-core/issues/350)) ([e7cb33e](https://github.com/defenseunicorns/uds-core/commit/e7cb33ea9a13ab9550aab45d8ee437a1ba595d38))
* **deps:** update zarf to v0.33.2 ([#394](https://github.com/defenseunicorns/uds-core/issues/394)) ([201a37b](https://github.com/defenseunicorns/uds-core/commit/201a37b12277880058c14fc05b3c0d4aecbf31e0))

## [0.21.1](https://github.com/defenseunicorns/uds-core/compare/v0.21.0...v0.21.1) (2024-05-02)


### Bug Fixes

* slim-dev monitoring handling ([#383](https://github.com/defenseunicorns/uds-core/issues/383)) ([79927aa](https://github.com/defenseunicorns/uds-core/commit/79927aa58cbb12c849e52b50c00b74629b100b31))


### Miscellaneous

* updating keycloak chart version to align with image ([#378](https://github.com/defenseunicorns/uds-core/issues/378)) ([a60fe2a](https://github.com/defenseunicorns/uds-core/commit/a60fe2afed9f7cff3bcad6b0f563232b47e8025b))

## [0.21.0](https://github.com/defenseunicorns/uds-core/compare/v0.20.0...v0.21.0) (2024-04-30)


### Features

* add `monitor` to operator, fix monitoring setup ([#256](https://github.com/defenseunicorns/uds-core/issues/256)) ([bf67722](https://github.com/defenseunicorns/uds-core/commit/bf67722d4e7e02d44dd29c4436e9a8d2ef960fa5))


### Bug Fixes

* loki s3 overrides ([#365](https://github.com/defenseunicorns/uds-core/issues/365)) ([3545066](https://github.com/defenseunicorns/uds-core/commit/354506647d65b0484332695abbbd58d91d9e7427))
* update neuvector values for least privilege ([#373](https://github.com/defenseunicorns/uds-core/issues/373)) ([7f4de4f](https://github.com/defenseunicorns/uds-core/commit/7f4de4f729e60a258abc40ce34f9c397fae99181))


### Miscellaneous

* add debug logging to endpointslice watch ([#359](https://github.com/defenseunicorns/uds-core/issues/359)) ([da3eb5a](https://github.com/defenseunicorns/uds-core/commit/da3eb5ab4f5e6ced50f838456999995d5be601b7))
* **deps:** update grafana to v7.3.9 ([#353](https://github.com/defenseunicorns/uds-core/issues/353)) ([4a70f40](https://github.com/defenseunicorns/uds-core/commit/4a70f407d5e06919aaa0dc5901f49f7f1b166c9d))
* **deps:** update istio to v1.21.2 ([#258](https://github.com/defenseunicorns/uds-core/issues/258)) ([51c6540](https://github.com/defenseunicorns/uds-core/commit/51c65405c87ed3c147bdd90172ab0588dc8e5db1))
* **deps:** update keycloak ([#349](https://github.com/defenseunicorns/uds-core/issues/349)) ([2ef1813](https://github.com/defenseunicorns/uds-core/commit/2ef181333d2fd853bb8eee2c5deb82430d68c861))
* **deps:** update keycloak to v0.4.2 ([#375](https://github.com/defenseunicorns/uds-core/issues/375)) ([b0bb8e4](https://github.com/defenseunicorns/uds-core/commit/b0bb8e47f78886186514f188a99ff38463a5eac3))
* **deps:** update zarf to v0.33.1 ([#368](https://github.com/defenseunicorns/uds-core/issues/368)) ([296e547](https://github.com/defenseunicorns/uds-core/commit/296e54729c20c9ecee21677daec874a2c8b57b57))
* move api service watch to reconcile ([#362](https://github.com/defenseunicorns/uds-core/issues/362)) ([1822bca](https://github.com/defenseunicorns/uds-core/commit/1822bca6c397a5c8ea64b9355a9ba4f51fde4518))
* refactor promtail extraScrapeConfigs into scrapeConfigs ([#367](https://github.com/defenseunicorns/uds-core/issues/367)) ([2220272](https://github.com/defenseunicorns/uds-core/commit/222027240148e669edf40483d145ffc15567b1b7))
* trigger eks nightly when related files are updated ([#366](https://github.com/defenseunicorns/uds-core/issues/366)) ([6d6e4e0](https://github.com/defenseunicorns/uds-core/commit/6d6e4e0debbca3498cbc21db405eec48b3bcc240))

## [0.20.0](https://github.com/defenseunicorns/uds-core/compare/v0.19.0...v0.20.0) (2024-04-20)


### Features

* add keycloak sso realm values ([#352](https://github.com/defenseunicorns/uds-core/issues/352)) ([74436ea](https://github.com/defenseunicorns/uds-core/commit/74436ea78684a74044efdee14564a6582e659998))
* add saml and attribute/mapper support for keycloak in uds pepr operator ([#328](https://github.com/defenseunicorns/uds-core/issues/328)) ([c53d4ee](https://github.com/defenseunicorns/uds-core/commit/c53d4ee1227d71b60a35419f7c8c9396d71b9508))
* enable sso for neuvector ([#351](https://github.com/defenseunicorns/uds-core/issues/351)) ([597353e](https://github.com/defenseunicorns/uds-core/commit/597353e294e3dc5c06a8d572414e188f9845af8e))
* keycloak PVC customization ([#341](https://github.com/defenseunicorns/uds-core/issues/341)) ([f8eae2a](https://github.com/defenseunicorns/uds-core/commit/f8eae2a20e02faac6e2c441845a82febeaab3b89))


### Bug Fixes

* add nightly uds-bundle.yaml to release-please extras for updates ([#346](https://github.com/defenseunicorns/uds-core/issues/346)) ([d1b3071](https://github.com/defenseunicorns/uds-core/commit/d1b3071182b48ef4905bb040d203fa42d7bbf76f))


### Miscellaneous

* **deps:** update grafana ([#339](https://github.com/defenseunicorns/uds-core/issues/339)) ([52e6c1b](https://github.com/defenseunicorns/uds-core/commit/52e6c1b3bb003402710bc0fa85419538f38b388f))
* **deps:** update neuvector ([#333](https://github.com/defenseunicorns/uds-core/issues/333)) ([010e287](https://github.com/defenseunicorns/uds-core/commit/010e287dbf3a712d19e54bfbbaa87807585130d7))
* **deps:** update pepr ([#340](https://github.com/defenseunicorns/uds-core/issues/340)) ([e71ba4a](https://github.com/defenseunicorns/uds-core/commit/e71ba4ab4eb1ea1cc482b507fef4e0e2735bbd1f))
* **deps:** update prometheus-stack ([#301](https://github.com/defenseunicorns/uds-core/issues/301)) ([143eca3](https://github.com/defenseunicorns/uds-core/commit/143eca3ecc2e3c39765312dc3c5384c87a13d7da))
* **deps:** update to keycloak 24 ([#336](https://github.com/defenseunicorns/uds-core/issues/336)) ([1153ba0](https://github.com/defenseunicorns/uds-core/commit/1153ba09ac062d3477a4ee396376be83493ad3c5))
* **deps:** update uds-identity-config to 0.4.1 ([#355](https://github.com/defenseunicorns/uds-core/issues/355)) ([8485931](https://github.com/defenseunicorns/uds-core/commit/84859316ea92ef9ec7807a702ee246e11b73567b))

## [0.19.0](https://github.com/defenseunicorns/uds-core/compare/v0.18.0...v0.19.0) (2024-04-12)


### Features

* add nightly testing eks ([#250](https://github.com/defenseunicorns/uds-core/issues/250)) ([543b09d](https://github.com/defenseunicorns/uds-core/commit/543b09d103a43c474da6a8c950404cc1f373b03f))


### Bug Fixes

* drop path normalization to MERGE_SLASHES to allow apps to handle encoded slashes ([#330](https://github.com/defenseunicorns/uds-core/issues/330)) ([26e965f](https://github.com/defenseunicorns/uds-core/commit/26e965fd71dd325bd8df451ce317456bf2d15073))
* loki bucket configuration service_account and namespace ([#332](https://github.com/defenseunicorns/uds-core/issues/332)) ([9518634](https://github.com/defenseunicorns/uds-core/commit/9518634b24f2d5c285e598f8620849bbc6288ba4))


### Miscellaneous

* **deps:** update grafana ([#257](https://github.com/defenseunicorns/uds-core/issues/257)) ([c98e566](https://github.com/defenseunicorns/uds-core/commit/c98e5661c3e6fb84bf17fc64170f5dd39779dda7))
* **deps:** update metrics-server ([#298](https://github.com/defenseunicorns/uds-core/issues/298)) ([691fd87](https://github.com/defenseunicorns/uds-core/commit/691fd87ae3e523c897d0461c4a0384b2bb7c8c03))
* **deps:** update pepr ([#324](https://github.com/defenseunicorns/uds-core/issues/324)) ([2ef0f96](https://github.com/defenseunicorns/uds-core/commit/2ef0f96da7476b487d72d4bb7ce4bd50fdb0b182))
* **deps:** update pepr to v0.28.7 ([#321](https://github.com/defenseunicorns/uds-core/issues/321)) ([e7206bb](https://github.com/defenseunicorns/uds-core/commit/e7206bb93ce23a3ae611e410106890df3eafdea1))
* **deps:** update promtail ([#74](https://github.com/defenseunicorns/uds-core/issues/74)) ([6a112b5](https://github.com/defenseunicorns/uds-core/commit/6a112b5226250f1a17023b2c1225d404cf8feeee))
* **deps:** update zarf to v0.32.6 ([#282](https://github.com/defenseunicorns/uds-core/issues/282)) ([443426d](https://github.com/defenseunicorns/uds-core/commit/443426d05b9bd1d15fb4632efa26219250270895))
* **deps:** update zarf to v0.33.0 ([#325](https://github.com/defenseunicorns/uds-core/issues/325)) ([f2a2a66](https://github.com/defenseunicorns/uds-core/commit/f2a2a665309c812b4300047d1c90ff3833a8eba6))
* update codeowners ([#338](https://github.com/defenseunicorns/uds-core/issues/338)) ([c419574](https://github.com/defenseunicorns/uds-core/commit/c41957409607c6335ebf6bd4ff30a1a9336a4870))

## [0.18.0](https://github.com/defenseunicorns/uds-core/compare/v0.17.0...v0.18.0) (2024-03-29)


### Features

* switch loki to simple scalable ([#156](https://github.com/defenseunicorns/uds-core/issues/156)) ([1661b15](https://github.com/defenseunicorns/uds-core/commit/1661b154657eba1b30fc5bcec64179cbf6037c03))


### Bug Fixes

* add kubeapi egress for neuvector enforcer ([#291](https://github.com/defenseunicorns/uds-core/issues/291)) ([87fc886](https://github.com/defenseunicorns/uds-core/commit/87fc886bc736104a9a3c3aefc4c7d232ed74a4f2))
* pepr ironbank renovate update ([#299](https://github.com/defenseunicorns/uds-core/issues/299)) ([287e40d](https://github.com/defenseunicorns/uds-core/commit/287e40db5d65f7472a9e9216aae91f3ad92403d9))
* release workflow k3d image ([#316](https://github.com/defenseunicorns/uds-core/issues/316)) ([e7835e0](https://github.com/defenseunicorns/uds-core/commit/e7835e071f56af148792fbde250100af8e8ca0b8))
* unwanted exemption deletions ([#290](https://github.com/defenseunicorns/uds-core/issues/290)) ([50b0cd4](https://github.com/defenseunicorns/uds-core/commit/50b0cd4211964a90139347558028d6c461956da9))


### Miscellaneous

* add debug output to release workflow ([#285](https://github.com/defenseunicorns/uds-core/issues/285)) ([5f96865](https://github.com/defenseunicorns/uds-core/commit/5f968651fb4f0da563d9c388efab761863f9ea08))
* **deps:** update dependency defenseunicorns/uds-common to v0.3.6 ([#261](https://github.com/defenseunicorns/uds-core/issues/261)) ([1b5398b](https://github.com/defenseunicorns/uds-core/commit/1b5398b7b778ead8ac3265080ae0bd2b5761066e))
* **deps:** update githubactions ([#242](https://github.com/defenseunicorns/uds-core/issues/242)) ([1eb2e2c](https://github.com/defenseunicorns/uds-core/commit/1eb2e2cd2018f0cd8fb55d8e6576b7e36fa8c3cf))
* **deps:** update pepr to v0.28.6 ([#300](https://github.com/defenseunicorns/uds-core/issues/300)) ([86b43e4](https://github.com/defenseunicorns/uds-core/commit/86b43e478521aa88a3a4843948ca96b9cbe55985))
* **deps:** update prometheus-stack ([#190](https://github.com/defenseunicorns/uds-core/issues/190)) ([f9a605a](https://github.com/defenseunicorns/uds-core/commit/f9a605a4c828128fc19f0bdb1d2443f65fb87b8a))
* **deps:** update uds-k3d to v0.6.0 ([#240](https://github.com/defenseunicorns/uds-core/issues/240)) ([6a26523](https://github.com/defenseunicorns/uds-core/commit/6a2652368fde3a3bdbe5bb81fd258830dfaeb5c8))
* **deps:** update velero ([#260](https://github.com/defenseunicorns/uds-core/issues/260)) ([f352008](https://github.com/defenseunicorns/uds-core/commit/f35200833a4d4d50de9f632f6918320f7d8fff5e))
* **main:** release 0.18.0 ([#286](https://github.com/defenseunicorns/uds-core/issues/286)) ([40e6b7b](https://github.com/defenseunicorns/uds-core/commit/40e6b7b711ddbd956058eda8490355568faddaec))
* support headless keycloak admin user ([#307](https://github.com/defenseunicorns/uds-core/issues/307)) ([a0e51b6](https://github.com/defenseunicorns/uds-core/commit/a0e51b649822619b63478b140bb5dbbebeb20ff3))

## [0.17.0](https://github.com/defenseunicorns/uds-core/compare/v0.16.1...v0.17.0) (2024-03-22)


### Features

* introduce sso secret templating ([#276](https://github.com/defenseunicorns/uds-core/issues/276)) ([e0832ec](https://github.com/defenseunicorns/uds-core/commit/e0832ec2ee825dc1725483350e3b9295937b8feb))


### Bug Fixes

* add keycloak to dev bundle and rename ([#262](https://github.com/defenseunicorns/uds-core/issues/262)) ([f9b905c](https://github.com/defenseunicorns/uds-core/commit/f9b905c7c2b7e4a6a43e7c83918e3157008433d3))
* registration robot check form id ([#269](https://github.com/defenseunicorns/uds-core/issues/269)) ([c6419b9](https://github.com/defenseunicorns/uds-core/commit/c6419b962eb5a02462e9060a66f7765689cfeb8f))
* sticky sessions for keycloak in ha ([#281](https://github.com/defenseunicorns/uds-core/issues/281)) ([5ccd557](https://github.com/defenseunicorns/uds-core/commit/5ccd5576afc34d8b24061887f91ce284ec5857a1))


### Miscellaneous

* align mutation annotations ([#268](https://github.com/defenseunicorns/uds-core/issues/268)) ([f18ad4d](https://github.com/defenseunicorns/uds-core/commit/f18ad4db94a77f4229cc9267e0129f6aa3381c9a))
* **deps:** update loki ([#209](https://github.com/defenseunicorns/uds-core/issues/209)) ([03ca499](https://github.com/defenseunicorns/uds-core/commit/03ca499bd5d9cac800bd36dca80340ceac3f3009))
* **deps:** update pepr to v0.28.6 ([#254](https://github.com/defenseunicorns/uds-core/issues/254)) ([54ef7de](https://github.com/defenseunicorns/uds-core/commit/54ef7ded349d060b1732b381124fe29e3e8fe85b))
* **deps:** update zarf to v0.32.5 ([#243](https://github.com/defenseunicorns/uds-core/issues/243)) ([ee93612](https://github.com/defenseunicorns/uds-core/commit/ee9361224767c1a708b6f8e2c266af710facea8d))
* typo fix in README.md ([#280](https://github.com/defenseunicorns/uds-core/issues/280)) ([f9727e0](https://github.com/defenseunicorns/uds-core/commit/f9727e0b638e853bbae131d02019a2efb5286b0a))

## [0.16.1](https://github.com/defenseunicorns/uds-core/compare/v0.16.0...v0.16.1) (2024-03-16)


### Bug Fixes

* arm64 packages / bundles creation ([#264](https://github.com/defenseunicorns/uds-core/issues/264)) ([425fa18](https://github.com/defenseunicorns/uds-core/commit/425fa184fca6bcebd1eea431dce7112cadae2f44))

## [0.16.0](https://github.com/defenseunicorns/uds-core/compare/v0.15.1...v0.16.0) (2024-03-15)


### Features

* add velero package ([#210](https://github.com/defenseunicorns/uds-core/issues/210)) ([a272945](https://github.com/defenseunicorns/uds-core/commit/a27294585f0d50732b63672d0c2baf14948e29d1))
* **operator:** add events and improve lifecycle ops ([#245](https://github.com/defenseunicorns/uds-core/issues/245)) ([502c044](https://github.com/defenseunicorns/uds-core/commit/502c044547048a380b1f73dead0b8ab1b14a4b4f))


### Bug Fixes

* ocsp lookup egress policy ([#255](https://github.com/defenseunicorns/uds-core/issues/255)) ([77c38f2](https://github.com/defenseunicorns/uds-core/commit/77c38f22e9a77d9db81504f4c172fdc535c0929e))


### Miscellaneous

* add flavor to pepr build task ([#238](https://github.com/defenseunicorns/uds-core/issues/238)) ([29bf8a3](https://github.com/defenseunicorns/uds-core/commit/29bf8a3b83255c7548201f3ea19e22452a1d1d4a))
* **deps:** update grafana ([#144](https://github.com/defenseunicorns/uds-core/issues/144)) ([6987927](https://github.com/defenseunicorns/uds-core/commit/698792728faf8cfeabaf7a7c735c91229cc0c07f))
* **deps:** update neuvector ([#73](https://github.com/defenseunicorns/uds-core/issues/73)) ([50f6c90](https://github.com/defenseunicorns/uds-core/commit/50f6c90ca31d5bf984e44fd1ded7c5cfcb968064))
* test artifacts before publish ([#198](https://github.com/defenseunicorns/uds-core/issues/198)) ([9732f32](https://github.com/defenseunicorns/uds-core/commit/9732f325624244f4d34c127a949c6ce5951ff6ab))

## [0.15.1](https://github.com/defenseunicorns/uds-core/compare/v0.15.0...v0.15.1) (2024-03-11)


### Bug Fixes

* **keycloak:** only use PVC for devMode ([#241](https://github.com/defenseunicorns/uds-core/issues/241)) ([a6e6023](https://github.com/defenseunicorns/uds-core/commit/a6e6023134dc5171441a2043701ed91309e1b32c))


### Miscellaneous

* annotate mutations in policies ([#236](https://github.com/defenseunicorns/uds-core/issues/236)) ([cc9db50](https://github.com/defenseunicorns/uds-core/commit/cc9db500bb1033a516104f409fa05b3a1101d832))
* **deps:** update zarf to v0.32.4 ([#203](https://github.com/defenseunicorns/uds-core/issues/203)) ([05c903e](https://github.com/defenseunicorns/uds-core/commit/05c903ea43243401d9cc2928ba5eb66ff6201c94))

## [0.15.0](https://github.com/defenseunicorns/uds-core/compare/v0.14.5...v0.15.0) (2024-03-07)


### Features

* add policy exemptions ([#165](https://github.com/defenseunicorns/uds-core/issues/165)) ([196df88](https://github.com/defenseunicorns/uds-core/commit/196df88b01347e530eb1cb49df7440d62c986e0e))


### Miscellaneous

* **deps:** update dependency defenseunicorns/uds-common to v0.2.2 ([#232](https://github.com/defenseunicorns/uds-core/issues/232)) ([083ae0c](https://github.com/defenseunicorns/uds-core/commit/083ae0c45667e5b9064cbff781fbe4e5bc0d2991))
* **deps:** update githubactions to de90cc6 ([#215](https://github.com/defenseunicorns/uds-core/issues/215)) ([f79eed0](https://github.com/defenseunicorns/uds-core/commit/f79eed03b2495d9f3e11edb433291ce8a3aa55ee))

## [0.14.5](https://github.com/defenseunicorns/uds-core/compare/v0.14.4...v0.14.5) (2024-03-06)


### Bug Fixes

* valueFrom in KeyCloak statefulset.yaml ([#229](https://github.com/defenseunicorns/uds-core/issues/229)) ([189a5ce](https://github.com/defenseunicorns/uds-core/commit/189a5ce3a9dd16fe9646a293ca3948db21eb5d78))

## [0.14.4](https://github.com/defenseunicorns/uds-core/compare/v0.14.3...v0.14.4) (2024-03-05)


### Bug Fixes

* remove spec from secret yaml ([#226](https://github.com/defenseunicorns/uds-core/issues/226)) ([e4b5848](https://github.com/defenseunicorns/uds-core/commit/e4b58487f736f588944f7c039b8654f9006e04f1))

## [0.14.3](https://github.com/defenseunicorns/uds-core/compare/v0.14.2...v0.14.3) (2024-03-05)


### Bug Fixes

* **keycloak:** add missing postgres host and port secret keys ([#224](https://github.com/defenseunicorns/uds-core/issues/224)) ([0c4d775](https://github.com/defenseunicorns/uds-core/commit/0c4d7758cfb077ff592fea907795402485b6c9f5))

## [0.14.2](https://github.com/defenseunicorns/uds-core/compare/v0.14.1...v0.14.2) (2024-03-04)


### Bug Fixes

* basic validations for packages ([#208](https://github.com/defenseunicorns/uds-core/issues/208)) ([9eba3af](https://github.com/defenseunicorns/uds-core/commit/9eba3afb7e288c13f75f93d5712d50a3b9e7b92d))
* keycloak volume permissions, UI update ([#223](https://github.com/defenseunicorns/uds-core/issues/223)) ([4454d3e](https://github.com/defenseunicorns/uds-core/commit/4454d3efcefe6bfa81628d330434afcc246fad65))
* kubeapi netpol generation now also includes the ip from the kubernetes service ([#219](https://github.com/defenseunicorns/uds-core/issues/219)) ([0a83d02](https://github.com/defenseunicorns/uds-core/commit/0a83d02f5782d911e3bb63935b0cac70030e5c9b))


### Miscellaneous

* **deps:** update uds to v0.9.2 ([#200](https://github.com/defenseunicorns/uds-core/issues/200)) ([e4b54fe](https://github.com/defenseunicorns/uds-core/commit/e4b54febc4d7914e962db92b7a0490a3735af4e5))
* **deps:** update uds-k3d to v0.5.0 ([#186](https://github.com/defenseunicorns/uds-core/issues/186)) ([164bf5f](https://github.com/defenseunicorns/uds-core/commit/164bf5f8bd58899f5ec1a179d6d409cfb46b850f))

## [0.14.1](https://github.com/defenseunicorns/uds-core/compare/v0.14.0...v0.14.1) (2024-03-04)


### Bug Fixes

* hotfix for publishing workflows ([#217](https://github.com/defenseunicorns/uds-core/issues/217)) ([5fefa01](https://github.com/defenseunicorns/uds-core/commit/5fefa017d382b7c5557e613b81cd84b27bda85f0))

## [0.14.0](https://github.com/defenseunicorns/uds-core/compare/v0.13.1...v0.14.0) (2024-03-04)


### Features

* add keycloak ([#147](https://github.com/defenseunicorns/uds-core/issues/147)) ([f99d3d5](https://github.com/defenseunicorns/uds-core/commit/f99d3d5d4f89264a21dd76d8847e1cef0325d127))


### Miscellaneous

* **deps:** update dependency defenseunicorns/uds-common to v0.2.1 ([#205](https://github.com/defenseunicorns/uds-core/issues/205)) ([1b01407](https://github.com/defenseunicorns/uds-core/commit/1b01407c4ae3a707db381b07e1364c572c76eceb))
* **deps:** update githubactions to v19 ([#204](https://github.com/defenseunicorns/uds-core/issues/204)) ([d65acd4](https://github.com/defenseunicorns/uds-core/commit/d65acd4e2d37907685ba9083ff98988b4ea1d452))
* **deps:** update loki to v5.43.3 ([#199](https://github.com/defenseunicorns/uds-core/issues/199)) ([40f1554](https://github.com/defenseunicorns/uds-core/commit/40f155469670a4b7290819fc09d28ff1fcc06a81))
* **deps:** update metrics-server ([#123](https://github.com/defenseunicorns/uds-core/issues/123)) ([fb25a97](https://github.com/defenseunicorns/uds-core/commit/fb25a970d6e3b51432164fab05ea2d19d1a638ef))

## [0.13.1](https://github.com/defenseunicorns/uds-core/compare/v0.13.0...v0.13.1) (2024-02-21)


### Bug Fixes

* revert "chore: support deselection of metrics-server" ([#196](https://github.com/defenseunicorns/uds-core/issues/196)) ([25a408d](https://github.com/defenseunicorns/uds-core/commit/25a408daeb7f6daada11c21e451f973ebe92c07c))

## [0.13.0](https://github.com/defenseunicorns/uds-core/compare/v0.12.0...v0.13.0) (2024-02-20)


### Features

* add authservice to uds-core ([#153](https://github.com/defenseunicorns/uds-core/issues/153)) ([b0b33b9](https://github.com/defenseunicorns/uds-core/commit/b0b33b98ae12fe233c922bba55c9328212c2e578))


### Bug Fixes

* validating/mutating webhook networkpolicies and mtls ([#192](https://github.com/defenseunicorns/uds-core/issues/192)) ([b01e629](https://github.com/defenseunicorns/uds-core/commit/b01e62960985dd7cb318372abff296fb96f1012b))


### Miscellaneous

* add security.md ([#189](https://github.com/defenseunicorns/uds-core/issues/189)) ([bf7c1d2](https://github.com/defenseunicorns/uds-core/commit/bf7c1d28e077cf52d4f765b50d7efb8ce5d60fff))
* **deps:** update githubactions ([#179](https://github.com/defenseunicorns/uds-core/issues/179)) ([7797e25](https://github.com/defenseunicorns/uds-core/commit/7797e259b9691099cce9e151ce1ebf9f9f181435))
* **deps:** update githubactions to ebc4d7e ([#183](https://github.com/defenseunicorns/uds-core/issues/183)) ([77357e7](https://github.com/defenseunicorns/uds-core/commit/77357e72cc0344e61fedcab7197aabdd7e4fd2a0))
* **deps:** update githubactions to v3 ([#181](https://github.com/defenseunicorns/uds-core/issues/181)) ([70c5ddf](https://github.com/defenseunicorns/uds-core/commit/70c5ddf1ee0e5017bee4057d96b320812a964f88))
* **deps:** update istio to v1.20.3 ([#163](https://github.com/defenseunicorns/uds-core/issues/163)) ([e45de0e](https://github.com/defenseunicorns/uds-core/commit/e45de0e5917a2ca6c3e30e593e2d9a8d393849a9))
* **deps:** update loki to v5.43.0 ([#180](https://github.com/defenseunicorns/uds-core/issues/180)) ([bab5f7a](https://github.com/defenseunicorns/uds-core/commit/bab5f7aba3644c0e478a17338df4e074b0c1a6a2))
* **deps:** update loki to v5.43.1 ([#182](https://github.com/defenseunicorns/uds-core/issues/182)) ([6cc5fc7](https://github.com/defenseunicorns/uds-core/commit/6cc5fc7f5a07d848cfe4f18dc9a7e2a4cd91b1cf))
* **deps:** update loki to v5.43.2 ([#191](https://github.com/defenseunicorns/uds-core/issues/191)) ([0ec0cd4](https://github.com/defenseunicorns/uds-core/commit/0ec0cd4d6cdc7b4eb1eea33f4da7b144ecbc29a5))
* **deps:** update pepr to v0.25.0 ([#164](https://github.com/defenseunicorns/uds-core/issues/164)) ([e7b8212](https://github.com/defenseunicorns/uds-core/commit/e7b8212b6a8ed2e16b47264687e0c39d2f0a3455))
* **deps:** update uds to v0.9.0 ([#173](https://github.com/defenseunicorns/uds-core/issues/173)) ([b91a90d](https://github.com/defenseunicorns/uds-core/commit/b91a90db987e108a5a093a326428bbd0b5f9446e))
* **deps:** update zarf to v0.32.3 ([#155](https://github.com/defenseunicorns/uds-core/issues/155)) ([2f0a1a7](https://github.com/defenseunicorns/uds-core/commit/2f0a1a77043ce298e765e6999cf11a97f36e4ecc))
* support deselection of metrics-server ([#193](https://github.com/defenseunicorns/uds-core/issues/193)) ([289a0fe](https://github.com/defenseunicorns/uds-core/commit/289a0fee5315e8c4a70b3afe66165dd00a7dfbc1))

## [0.12.0](https://github.com/defenseunicorns/uds-core/compare/v0.11.1...v0.12.0) (2024-02-09)


### Features

* introduce advancedHTTP for expose field & change podLabels to selector ([#154](https://github.com/defenseunicorns/uds-core/issues/154)) ([1079267](https://github.com/defenseunicorns/uds-core/commit/107926791149989a782254b8798b7c57a35cfcaf))


### Miscellaneous

* **deps:** pin dependencies ([#79](https://github.com/defenseunicorns/uds-core/issues/79)) ([bfab11e](https://github.com/defenseunicorns/uds-core/commit/bfab11e345941d23dfeb928917f38e36a2f75bc9))
* remove retry-action action on registry1 docker login ([#160](https://github.com/defenseunicorns/uds-core/issues/160)) ([eea0c93](https://github.com/defenseunicorns/uds-core/commit/eea0c93a0ff172bfc5a76d3eaca143ffc0d9fbe2))

## [0.11.1](https://github.com/defenseunicorns/uds-core/compare/v0.11.0...v0.11.1) (2024-02-08)


### Bug Fixes

* non-vendored zarf command refs ([#157](https://github.com/defenseunicorns/uds-core/issues/157)) ([fe183a9](https://github.com/defenseunicorns/uds-core/commit/fe183a9ae367bc2d7ea7d629e7c15877aabe38cd))

## [0.11.0](https://github.com/defenseunicorns/uds-core/compare/v0.10.0...v0.11.0) (2024-02-07)


### Features

* added initial oscal files ([#145](https://github.com/defenseunicorns/uds-core/issues/145)) ([9600d5f](https://github.com/defenseunicorns/uds-core/commit/9600d5f159e4a04e8f71313f8ed118b87efbb9a1))


### Bug Fixes

* network policy to allow metrics-server ingress ([#148](https://github.com/defenseunicorns/uds-core/issues/148)) ([f1d434a](https://github.com/defenseunicorns/uds-core/commit/f1d434a68ef1f2a29ab3b13608bc16ce78211ed4))


### Miscellaneous

* **deps:** update grafana to v7.2.5 ([#136](https://github.com/defenseunicorns/uds-core/issues/136)) ([a271270](https://github.com/defenseunicorns/uds-core/commit/a271270f2d3f3488aa9664ef5ad69a4d239c5d22))
* **deps:** update grafana to v7.3.0 ([#142](https://github.com/defenseunicorns/uds-core/issues/142)) ([5e960c0](https://github.com/defenseunicorns/uds-core/commit/5e960c0479e6fc96244db0230296c94e936e57d8))
* **deps:** update loki ([#131](https://github.com/defenseunicorns/uds-core/issues/131)) ([61250b0](https://github.com/defenseunicorns/uds-core/commit/61250b02eca7ca57d7f346c1da5b63f19de17c49))
* **deps:** update pepr to v0.24.1 ([#134](https://github.com/defenseunicorns/uds-core/issues/134)) ([6474a1c](https://github.com/defenseunicorns/uds-core/commit/6474a1c0a16c8d87248acb1b3f7d79b76a354fc8))
* **deps:** update prometheus-stack ([#128](https://github.com/defenseunicorns/uds-core/issues/128)) ([625622a](https://github.com/defenseunicorns/uds-core/commit/625622a44c101f0a9c1beffd66eb259dc1f1eedc))
* **deps:** update uds to v0.8.1 ([#141](https://github.com/defenseunicorns/uds-core/issues/141)) ([fa79065](https://github.com/defenseunicorns/uds-core/commit/fa79065265a5ee2b8f6f6a55d1c2904bbaf42fff))
* **deps:** update zarf to v0.32.2 ([#133](https://github.com/defenseunicorns/uds-core/issues/133)) ([91502c6](https://github.com/defenseunicorns/uds-core/commit/91502c6321334c6d31ce5fd1cd8f2fe6f77c09ae))
* readme updates & use UDS CLI for zarf ([#137](https://github.com/defenseunicorns/uds-core/issues/137)) ([21de0ce](https://github.com/defenseunicorns/uds-core/commit/21de0cee2d70d67ca17b1d45c642e9ca4e1617ce))
* renovate updates ([#140](https://github.com/defenseunicorns/uds-core/issues/140)) ([b71a013](https://github.com/defenseunicorns/uds-core/commit/b71a013bea30c9ca5e39f1dc6485fffaa86ca6b1))

## [0.10.0](https://github.com/defenseunicorns/uds-core/compare/v0.9.2...v0.10.0) (2024-01-26)


### Features

* add Istio VirtualService Requestmatch to UDS Operator ([#129](https://github.com/defenseunicorns/uds-core/issues/129)) ([a207197](https://github.com/defenseunicorns/uds-core/commit/a20719726991d3b981a372b705b776948f6fbc30))


### Miscellaneous

* **deps:** update grafana to v10.3.1 ([#132](https://github.com/defenseunicorns/uds-core/issues/132)) ([09e028c](https://github.com/defenseunicorns/uds-core/commit/09e028c63093a6f5fdfd0b1be800b07c0eb9de77))
* **deps:** update istio to v1.20.2 ([#75](https://github.com/defenseunicorns/uds-core/issues/75)) ([671f977](https://github.com/defenseunicorns/uds-core/commit/671f977ff183010ce75e323532db500dcd4aa69c))

## [0.9.2](https://github.com/defenseunicorns/uds-core/compare/v0.9.1...v0.9.2) (2024-01-24)


### Miscellaneous

* **deps:** update grafana ([#80](https://github.com/defenseunicorns/uds-core/issues/80)) ([ccb2c12](https://github.com/defenseunicorns/uds-core/commit/ccb2c1280313fe69198ecab5fea5b38fc650f699))
* **deps:** update loki ([#72](https://github.com/defenseunicorns/uds-core/issues/72)) ([98134bb](https://github.com/defenseunicorns/uds-core/commit/98134bba1f6078a867aae2ae28f4152ba7b1a8e5))
* **deps:** update pepr ([#116](https://github.com/defenseunicorns/uds-core/issues/116)) ([bfa7352](https://github.com/defenseunicorns/uds-core/commit/bfa7352ebe962ef1ed091f4a5799ed4974e086ef))
* **deps:** update prometheus-stack ([#81](https://github.com/defenseunicorns/uds-core/issues/81)) ([19bedb6](https://github.com/defenseunicorns/uds-core/commit/19bedb60cd2f99615c4b5673623ff0ff6fafb73f))
* **deps:** update uds to v0.6.2 ([#107](https://github.com/defenseunicorns/uds-core/issues/107)) ([7b7220e](https://github.com/defenseunicorns/uds-core/commit/7b7220e708cf2dca25cc592b8932661620d9610d))
* **deps:** update uds-k3d to v0.3.1 ([#89](https://github.com/defenseunicorns/uds-core/issues/89)) ([5d54cd1](https://github.com/defenseunicorns/uds-core/commit/5d54cd1efe5eee4c19caf347882725e0aa20e50a))
* refactor ci for releases to remove certain artifacts ([#125](https://github.com/defenseunicorns/uds-core/issues/125)) ([c08a062](https://github.com/defenseunicorns/uds-core/commit/c08a062bb3f3ede6860c3d7f34136b3e82b78715))

## [0.9.1](https://github.com/defenseunicorns/uds-core/compare/v0.9.0...v0.9.1) (2024-01-22)


### Bug Fixes

* update missing flavor create inputs in publish step ([#118](https://github.com/defenseunicorns/uds-core/issues/118)) ([a0233eb](https://github.com/defenseunicorns/uds-core/commit/a0233eb45e2d39035f483f3ed8fb3f396e5030d8))

## [0.9.0](https://github.com/defenseunicorns/uds-core/compare/v0.8.1...v0.9.0) (2024-01-21)


### Features

* add Zarf Flavors to support Iron Bank & upstream images ([#63](https://github.com/defenseunicorns/uds-core/issues/63)) ([232c256](https://github.com/defenseunicorns/uds-core/commit/232c2566b96be0285c24b8b5787350897e72332f))

## [0.8.1](https://github.com/defenseunicorns/uds-core/compare/v0.8.0...v0.8.1) (2024-01-18)


### Bug Fixes

* remove loki gateway anti-affinity ([#111](https://github.com/defenseunicorns/uds-core/issues/111)) ([2cba42e](https://github.com/defenseunicorns/uds-core/commit/2cba42e3a83a25ae7a45f3c3d6a35bdc7bba0b58))

## [0.8.0](https://github.com/defenseunicorns/uds-core/compare/v0.7.4...v0.8.0) (2024-01-16)


### Features

* add UDS Operator and consolidate UDS Policies ([#66](https://github.com/defenseunicorns/uds-core/issues/66)) ([395c1c4](https://github.com/defenseunicorns/uds-core/commit/395c1c4aec324d0d939cc410a6bb92129b26653b))


### Miscellaneous

* adding unit test for registerExemptions() ([#105](https://github.com/defenseunicorns/uds-core/issues/105)) ([5e71fcf](https://github.com/defenseunicorns/uds-core/commit/5e71fcf4751d2e3f6a1e55583ccf76c0fdc76856))
* **deps:** update pepr to v0.22.2 ([#104](https://github.com/defenseunicorns/uds-core/issues/104)) ([0555353](https://github.com/defenseunicorns/uds-core/commit/0555353e5a5dec2aa8685a3987852d1c3788f28c))

## [0.7.4](https://github.com/defenseunicorns/uds-core/compare/v0.7.3...v0.7.4) (2024-01-13)


### Bug Fixes

* change pepr error policy to reject ([#99](https://github.com/defenseunicorns/uds-core/issues/99)) ([10772e2](https://github.com/defenseunicorns/uds-core/commit/10772e2c64f1e4b965b6b644b0008c81025029e9))


### Miscellaneous

* **deps:** update pepr to v0.22.0 ([#102](https://github.com/defenseunicorns/uds-core/issues/102)) ([941902d](https://github.com/defenseunicorns/uds-core/commit/941902dcfc2ec1d5340d658f75811b3369489c56))

## [0.7.3](https://github.com/defenseunicorns/uds-core/compare/v0.7.2...v0.7.3) (2024-01-11)


### Bug Fixes

* add test for disallow selinux options and handle checking for us… ([#96](https://github.com/defenseunicorns/uds-core/issues/96)) ([88b969e](https://github.com/defenseunicorns/uds-core/commit/88b969e2aa4dea8b76dbe397d77c53941f7cfbc8))


### Miscellaneous

* **deps:** update uds to v0.5.3, zarf to v0.32.1, and uds-k3d to 0.3.0 ([#77](https://github.com/defenseunicorns/uds-core/issues/77)) ([596f9d8](https://github.com/defenseunicorns/uds-core/commit/596f9d8df51c3df1aa87fd0e09d9e69c87473bf0))
* open the aperture for pr workflow triggering ([#90](https://github.com/defenseunicorns/uds-core/issues/90)) ([d8a72f2](https://github.com/defenseunicorns/uds-core/commit/d8a72f2f2f3e507a4be7f217e23b737e3d4c35ce))
* simplify promtail values for scrape configs ([#94](https://github.com/defenseunicorns/uds-core/issues/94)) ([6c2513b](https://github.com/defenseunicorns/uds-core/commit/6c2513be89f064b44516b1d89c0d6005dd1d4d30))

## [0.7.2](https://github.com/defenseunicorns/uds-core/compare/v0.7.1...v0.7.2) (2024-01-09)


### Bug Fixes

* wait on istio proxies ([#87](https://github.com/defenseunicorns/uds-core/issues/87)) ([51cd5a0](https://github.com/defenseunicorns/uds-core/commit/51cd5a012cc1d095a89b30a22910d3d7ad49885d))


### Miscellaneous

* kick off ci ([1afc3a4](https://github.com/defenseunicorns/uds-core/commit/1afc3a4203cce1a1c81b15e7ba6caad1a9c63131))

## [0.7.1](https://github.com/defenseunicorns/uds-core/compare/v0.7.0...v0.7.1) (2024-01-08)


### Bug Fixes

* loki local storage ([#84](https://github.com/defenseunicorns/uds-core/issues/84)) ([b9505bb](https://github.com/defenseunicorns/uds-core/commit/b9505bbb42b5369c62d7cbfb05e1efb8b8a6200f))


### Miscellaneous

* **deps:** update pepr ([#76](https://github.com/defenseunicorns/uds-core/issues/76)) ([50de920](https://github.com/defenseunicorns/uds-core/commit/50de920bcf03092d16a11ebf77ede70987a7cdcf))

## [0.7.0](https://github.com/defenseunicorns/uds-core/compare/v0.6.2...v0.7.0) (2024-01-05)


### Features

* update security policy to use provided user, group, and fsgroup ([#82](https://github.com/defenseunicorns/uds-core/issues/82)) ([6d641ce](https://github.com/defenseunicorns/uds-core/commit/6d641ce67210999bacda0e855269dca61e7c6a7b))


### Miscellaneous

* initial renovate config ([#67](https://github.com/defenseunicorns/uds-core/issues/67)) ([2cd19d8](https://github.com/defenseunicorns/uds-core/commit/2cd19d871a95491950d43fea8e8fd2e8c290cd55))

## [0.6.2](https://github.com/defenseunicorns/uds-core/compare/v0.6.1...v0.6.2) (2023-12-11)


### Miscellaneous

* add minio deploy time bundle variable override definitions ([#58](https://github.com/defenseunicorns/uds-core/issues/58)) ([ca28e7b](https://github.com/defenseunicorns/uds-core/commit/ca28e7b4c4a42769934cc8ad69361ff29a348cc5))
* refactor validate.yaml file name and task name ([#62](https://github.com/defenseunicorns/uds-core/issues/62)) ([92a04ea](https://github.com/defenseunicorns/uds-core/commit/92a04ea1096448995ccc0dd9d77a32a5061e06f0))

## [0.6.1](https://github.com/defenseunicorns/uds-core/compare/v0.6.0...v0.6.1) (2023-12-07)


### Bug Fixes

* resolve istio job termination container status logic issue ([#55](https://github.com/defenseunicorns/uds-core/issues/55)) ([c0142c2](https://github.com/defenseunicorns/uds-core/commit/c0142c213446a37185cdf9dec5ae60aaae8ba194))

## [0.6.0](https://github.com/defenseunicorns/uds-core/compare/v0.5.0...v0.6.0) (2023-12-05)


### Features

* introduce Pepr common policies ([#50](https://github.com/defenseunicorns/uds-core/issues/50)) ([54182b4](https://github.com/defenseunicorns/uds-core/commit/54182b4db691d86ce80379be272d924d105b0d07))


### Miscellaneous

* conform to latest uds bundle schema ([#52](https://github.com/defenseunicorns/uds-core/issues/52)) ([14dad38](https://github.com/defenseunicorns/uds-core/commit/14dad3819187d4f8e13f7bbc191dca74a29b9c98))

## [0.5.0](https://github.com/defenseunicorns/uds-core/compare/v0.4.1...v0.5.0) (2023-11-19)


### Features

* expose tls certs as UDS bundle variables ([#48](https://github.com/defenseunicorns/uds-core/issues/48)) ([c1f8286](https://github.com/defenseunicorns/uds-core/commit/c1f828650ef2c53a3fd9ed477950046020c5d375))

## [0.4.1](https://github.com/defenseunicorns/uds-core/compare/v0.4.0...v0.4.1) (2023-11-17)


### Bug Fixes

* metrics-server mTLS fix ([#44](https://github.com/defenseunicorns/uds-core/issues/44)) ([4853522](https://github.com/defenseunicorns/uds-core/commit/4853522c9504c87dcbd8319d689ecb0a1cb42c0b))


### Miscellaneous

* dep updates for UDS CLI & Pepr ([#46](https://github.com/defenseunicorns/uds-core/issues/46)) ([1037634](https://github.com/defenseunicorns/uds-core/commit/10376349e350bd32f3bf32577d8f8089c09ac6cc))

## [0.4.0](https://github.com/defenseunicorns/uds-core/compare/v0.3.0...v0.4.0) (2023-11-16)


### Features

* add monitoring and logging ([#33](https://github.com/defenseunicorns/uds-core/issues/33)) ([c6d9aec](https://github.com/defenseunicorns/uds-core/commit/c6d9aece4984421e1ccbf476cd0d40fb701e4e50))

## [0.3.0](https://github.com/defenseunicorns/uds-core/compare/v0.2.0...v0.3.0) (2023-11-15)


### Features

* add metrics-server ([#35](https://github.com/defenseunicorns/uds-core/issues/35)) ([8216ab9](https://github.com/defenseunicorns/uds-core/commit/8216ab982be79dc393a2e0db359370b32e660150))

## [0.2.0](https://github.com/defenseunicorns/uds-core/compare/v0.1.3...v0.2.0) (2023-11-13)


### Features

* add pepr capability for istio + jobs ([#12](https://github.com/defenseunicorns/uds-core/issues/12)) ([c32a703](https://github.com/defenseunicorns/uds-core/commit/c32a70390f443c90796978ad4c42bbb4b17eb226))
* embed tls certs in istio package ([#32](https://github.com/defenseunicorns/uds-core/issues/32)) ([fb04fee](https://github.com/defenseunicorns/uds-core/commit/fb04feec9657f449366389a0e0a474a8cdeecb2c))

## [0.1.3](https://github.com/defenseunicorns/uds-core/compare/v0.1.2...v0.1.3) (2023-11-10)


### Miscellaneous

* bump zarf & uds-k3d deps ([#30](https://github.com/defenseunicorns/uds-core/issues/30)) ([dd28ab3](https://github.com/defenseunicorns/uds-core/commit/dd28ab3acd163aaccdfb76fbf9726c02a2ff0050))

## [0.1.2](https://github.com/defenseunicorns/uds-core/compare/v0.1.1...v0.1.2) (2023-11-09)


### Miscellaneous

* fix missing deps in tag and release workflow ([#28](https://github.com/defenseunicorns/uds-core/issues/28)) ([1e1af76](https://github.com/defenseunicorns/uds-core/commit/1e1af762e8eb1dd331cbd681e48ecc95ec3184d2))

## [0.1.1](https://github.com/defenseunicorns/uds-core/compare/v0.1.0...v0.1.1) (2023-11-09)


### Features

* Add istio and preliminary ci ([#3](https://github.com/defenseunicorns/uds-core/issues/3)) ([fbd7453](https://github.com/defenseunicorns/uds-core/commit/fbd745392340dbc978b27f0d321f3375882c1c40))
* add prometheus-stack (monitoring) capability ([#2](https://github.com/defenseunicorns/uds-core/issues/2)) ([e438ab6](https://github.com/defenseunicorns/uds-core/commit/e438ab6089bc9d8c6640fa002285d38ddc3022df))
* release-please integration ([#25](https://github.com/defenseunicorns/uds-core/issues/25)) ([bf3c53b](https://github.com/defenseunicorns/uds-core/commit/bf3c53b2ddac4e02e31aa3429029dd9f1c9595e3))


### Bug Fixes

* complete incomplete deploy task ([#21](https://github.com/defenseunicorns/uds-core/issues/21)) ([45ff5e5](https://github.com/defenseunicorns/uds-core/commit/45ff5e5d7b6a50cdfcfabb174349ab539a8accd9))


### Miscellaneous

* add commit lint workflow ([#19](https://github.com/defenseunicorns/uds-core/issues/19)) ([776a632](https://github.com/defenseunicorns/uds-core/commit/776a6325821329b2cbd97da2f40a30447cd48efc))
* remove version from neuvector zarf.yaml ([#11](https://github.com/defenseunicorns/uds-core/issues/11)) ([fbc8d51](https://github.com/defenseunicorns/uds-core/commit/fbc8d51e2b4146d394184d7596cd9a54219dc001))
* update release please extra-files to be explicit ([#26](https://github.com/defenseunicorns/uds-core/issues/26)) ([23f4999](https://github.com/defenseunicorns/uds-core/commit/23f49995771fb05cd18e7a077bf90e86ca5b7471))

## [0.0.0] - YYYY-MM-DD
PRE RELEASE

### Added
- Initial CHANGELOG.md
- CODEOWNERS
- CONTRIBUTING.md
- DEVELOPMENT_MAINTENANCE.md
- LICENSE
- README.md
- zarf.yaml
