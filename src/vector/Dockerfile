ARG BASE_REGISTRY=registry1.dso.mil
ARG BASE_IMAGE=ironbank/google/distroless/static
ARG BASE_TAG=nonroot

FROM docker.io/timberio/vector:0.40.1 AS upstream

FROM ${BASE_REGISTRY}/${BASE_IMAGE}:${BASE_TAG}

COPY --from=upstream /usr/local/bin/* /usr/local/bin/
COPY --from=upstream /var/lib/vector /var/lib/vector
COPY --from=upstream /etc/vector/vector.yaml /etc/vector/vector.yaml

HEALTHCHECK NONE

ENTRYPOINT ["/usr/local/bin/vector"]
