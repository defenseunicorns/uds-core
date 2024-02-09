FROM quay.io/keycloak/keycloak:23.0.5 as builder

COPY --chown=keycloak:keycloak providers/*.jar /opt/keycloak/providers
COPY --chown=keycloak:keycloak conf/truststore.jks /opt/keycloak/conf
COPY --chown=keycloak:keycloak conf/realm.json /opt/keycloak/data/import/realm.json

RUN chmod +rx /opt/keycloak/providers/*.jar

RUN /opt/keycloak/bin/kc.sh build --features=fips --fips-mode=strict

FROM quay.io/keycloak/keycloak:23.0.5
COPY --from=builder /opt/keycloak/ /opt/keycloak/

# Prevent CCE-84038-9 and CCE-85888-6
RUN chmod -R 0750 /opt/keycloak
RUN chown -R keycloak:keycloak /opt/keycloak

ENTRYPOINT ["/opt/keycloak/bin/kc.sh"]


WORKDIR /opt/keycloak
# for demonstration purposes only, please make sure to use proper certificates in production instead
RUN keytool -genkeypair -storepass password -storetype PKCS12 -keyalg RSA -keysize 2048 -dname "CN=server" -alias server -ext "SAN:c=DNS:localhost,IP:127.0.0.1" -keystore conf/server.keystore
RUN /opt/keycloak/bin/kc.sh build

FROM quay.io/keycloak/keycloak:latest
COPY --from=builder /opt/keycloak/ /opt/keycloak/

ENTRYPOINT ["/opt/keycloak/bin/kc.sh"]
