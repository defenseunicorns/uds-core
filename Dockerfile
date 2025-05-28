# Copyright 2025 Defense Unicorns
# SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-Defense-Unicorns-Commercial

FROM istio/proxyv2:1.26.0 AS base

FROM registry1.dso.mil/ironbank/tetrate/istio/proxyv2:1.26.0-fips

COPY --from=base /sbin/ip6tables-nft-save /usr/sbin/ip6tables-save
COPY --from=base /sbin/ip6tables-nft /usr/sbin/ip6tables
COPY --from=base /sbin/ip6tables-nft-restore /usr/sbin/ip6tables-restore
COPY --from=base /sbin/iptables-nft-save /usr/sbin/iptables-save
COPY --from=base /sbin/iptables-nft /usr/sbin/iptables
COPY --from=base /sbin/iptables-nft-restore /usr/sbin/iptables-restore
