FROM cgr.dev/chainguard/maven:openjdk-17 as plugin

WORKDIR /home/build

COPY pom.xml .
COPY src ./src

RUN mvn clean package
