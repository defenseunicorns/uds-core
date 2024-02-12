FROM cgr.dev/chainguard/maven:openjdk-17 as plugin

WORKDIR /home/build

COPY plugin/pom.xml .
COPY plugin/src ./src

RUN mvn clean package

FROM cgr.dev/chainguard/busybox:latest

WORKDIR /home/nonroot

COPY --chown=nonroot --from=plugin /home/build/target/*.jar .

COPY --chown=nonroot realm.json .

COPY --chown=nonroot theme theme
