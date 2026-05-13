FROM maven:3.9.6-eclipse-temurin-21-alpine AS builder

WORKDIR /build

# Primero solo el pom.xml → Docker cachea las dependencias
# Si no cambia el pom, esta capa no se reconstruye en futuros builds
COPY pom.xml .
RUN mvn dependency:go-offline -q

# Luego el código fuente
COPY src ./src

# Compilar sin tests (los tests corren en el pipeline CI, no aquí)
RUN mvn package -DskipTests -q

# ── Stage 2: Runtime ──────────────────────────────────────────────────────────
FROM eclipse-temurin:21-jre-alpine

LABEL org.opencontainers.image.title="backend-orchestrator"
LABEL org.opencontainers.image.description="SynapseOps MLOps Orchestrator — Spring Boot 3 / WebFlux"

# curl para el HEALTHCHECK
RUN apk add --no-cache curl

# ── Usuario no-root + acceso al socket Docker (DooD — ADR-004) ────────────────
# GID 999 es el estándar del grupo 'docker' en la mayoría de distros Linux.
# El socket /var/run/docker.sock montado desde el host hereda ese GID,
# por eso el usuario de la app debe pertenecer a ese grupo.
RUN addgroup -S spring && \
    adduser -S spring -G spring && \
    if getent group 999 > /dev/null 2>&1; then \
        adduser spring "$(getent group 999 | cut -d: -f1)"; \
    else \
        addgroup -g 999 -S docker-host && adduser spring docker-host; \
    fi

# Directorios de runtime
RUN mkdir -p /storage /logs && \
    chown -R spring:spring /storage /logs

WORKDIR /app

# JAR del builder
COPY --from=builder /build/target/*.jar app.jar
RUN chown spring:spring app.jar

USER spring

EXPOSE 8080

HEALTHCHECK --interval=15s --timeout=10s --start-period=40s --retries=5 \
  CMD curl -sf http://localhost:8080/actuator/health || exit 1

# Flags JVM para contenedor:
# -XX:+UseContainerSupport         → respeta los límites de cgroup (RAM del contenedor)
# -XX:MaxRAMPercentage=75.0        → usa máx 75% de la RAM asignada al contenedor
# -Djava.security.egd=...urandom   → evita bloqueo de entropy en Linux headless
ENTRYPOINT ["java", \
  "-XX:+UseContainerSupport", \
  "-XX:MaxRAMPercentage=75.0", \
  "-Djava.security.egd=file:/dev/./urandom", \
  "-jar", "app.jar"]