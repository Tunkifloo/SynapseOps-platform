#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# SynapseOps · Pruebas de INTEGRACIÓN (Backend Orchestrator, Testcontainers)
#
# Levanta un dockerd "moby" AISLADO (bridge propio, solo TCP, dirs separados) que
# COEXISTE con Docker Desktop sin conflictos, y ejecuta `mvnw test -Pintegration`.
#
# Por qué así (entorno de desarrollo Windows/WSL2):
#   - El Docker del host es Docker Desktop 29.x, cuyo API es incompatible con el
#     docker-java 3.3.0 que el proyecto fija a propósito (feature DooD de producción)
#     → Testcontainers falla con HTTP 400. Un dockerd moby nativo sí es compatible.
#   - Mockito (JDK 21) no puede auto-atacharse si corre como root → maven se ejecuta
#     como tu usuario normal (no-root); el daemon es TCP local y accesible para él.
#
# USO (en tu terminal WSL, dentro del repo):
#   sudo bash infra/testing/run-integration-tests.sh
# ─────────────────────────────────────────────────────────────────────────────
set -u

if [ "$(id -u)" -ne 0 ]; then
  echo "Este script necesita privilegios para el dockerd de pruebas. Ejecútalo con: sudo bash $0"
  exit 1
fi

RUN_USER="${SUDO_USER:-nico}"
[ "$RUN_USER" = "root" ] && RUN_USER="nico"
PROJECT_DIR="$(cd "$(dirname "$0")/../../Backend/backend-orchestrator" 2>/dev/null && pwd)"
DOCKER_TCP="tcp://127.0.0.1:2376"

echo ">> Usuario para maven (no-root): $RUN_USER"
echo ">> Proyecto: $PROJECT_DIR"

# 1) Bridge dedicado en rango libre (evita conflicto con docker0 de Docker Desktop)
if ! ip link show br-test >/dev/null 2>&1; then
  ip link add br-test type bridge
  ip addr add 10.210.0.1/24 dev br-test
  ip link set br-test up
fi

# 2) dockerd moby aislado (solo TCP; pidfile/data-root/exec-root separados)
pkill -f "dockerd.*2376" 2>/dev/null; sleep 2
rm -f /var/run/dockerd-test.pid /root/dockerd-test.log
echo ">> Arrancando dockerd de pruebas en $DOCKER_TCP ..."
nohup dockerd -H "$DOCKER_TCP" --bridge=br-test \
  --pidfile=/var/run/dockerd-test.pid \
  --data-root=/var/lib/docker-test --exec-root=/var/run/docker-test-exec \
  --default-address-pool base=10.211.0.0/16,size=24 \
  >/root/dockerd-test.log 2>&1 &

for i in $(seq 1 45); do docker -H "$DOCKER_TCP" info >/dev/null 2>&1 && break; sleep 1; done
if ! docker -H "$DOCKER_TCP" info >/dev/null 2>&1; then
  echo "!! No arrancó el dockerd de pruebas. Log:"; tail -30 /root/dockerd-test.log; exit 1
fi
echo ">> dockerd OK: $(docker -H "$DOCKER_TCP" version --format '{{.Server.Version}} (os={{.Server.Os}})')"

# 3) Testcontainers apunta al daemon de pruebas (props en el HOME del usuario no-root)
printf 'docker.host=%s\nryuk.disabled=true\n' "$DOCKER_TCP" > "/home/$RUN_USER/.testcontainers.properties"
chown "$RUN_USER:$RUN_USER" "/home/$RUN_USER/.testcontainers.properties"

# 4) Ejecuta la suite como usuario no-root (Mockito self-attach OK)
echo ">> Ejecutando: mvnw test -Pintegration (como $RUN_USER) ..."
su - "$RUN_USER" -c "cd '$PROJECT_DIR' && ./mvnw -Dmaven.repo.local=/home/$RUN_USER/.m2/repository test -Pintegration"
RESULT=$?

# 5) Limpieza del daemon de pruebas
kill "$(cat /var/run/dockerd-test.pid 2>/dev/null)" 2>/dev/null

echo ""
[ $RESULT -eq 0 ] && echo ">> INTEGRACIÓN: BUILD SUCCESS (captura la salida 'Tests run: 27 ... BUILD SUCCESS')" \
                  || echo ">> INTEGRACIÓN: FALLÓ (revisa la salida de maven arriba)"
exit $RESULT
