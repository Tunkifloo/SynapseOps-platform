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
#
# IMPORTANTE: NO ejecutes `./mvnw test -Pintegration` a secas. Sin este script no hay
# dockerd de pruebas y Testcontainers cae en Docker Desktop → HTTP 400 → los 27 tests
# fallan con "Could not find a valid Docker environment".
#
# Variables opcionales:
#   KEEP_DAEMON=1  → deja vivo el dockerd de pruebas al terminar (para re-ejecutar rápido)
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
KEEP_DAEMON="${KEEP_DAEMON:-0}"
TC_PROPS="/home/$RUN_USER/.testcontainers.properties"

# ── Preflight: fallar rápido y claro ────────────────────────────────────────
echo "===> PASO 0/4 · Comprobaciones previas"
if ! command -v dockerd >/dev/null 2>&1; then
  echo "!! No se encontró 'dockerd' en WSL. Instálalo con: sudo apt-get install -y docker.io"
  exit 1
fi
if [ -z "$PROJECT_DIR" ] || [ ! -f "$PROJECT_DIR/mvnw" ]; then
  echo "!! No se encontró el proyecto (Backend/backend-orchestrator/mvnw). ¿Ejecutas el script desde el repo?"
  exit 1
fi
if [ ! -d "/home/$RUN_USER" ]; then
  echo "!! No existe /home/$RUN_USER. Define el usuario correcto (SUDO_USER) para ejecutar maven sin root."
  exit 1
fi
echo "   OK · dockerd disponible · usuario maven (no-root): $RUN_USER"
echo "   Proyecto: $PROJECT_DIR"

# 1) Bridge dedicado en rango libre (evita conflicto con docker0 de Docker Desktop)
echo "===> PASO 1/4 · Red aislada (bridge br-test)"
if ! ip link show br-test >/dev/null 2>&1; then
  ip link add br-test type bridge
  ip addr add 10.210.0.1/24 dev br-test
  ip link set br-test up
  echo "   bridge br-test creado (10.210.0.1/24)"
else
  echo "   bridge br-test ya existía (se reutiliza)"
fi

# 2) dockerd moby aislado (solo TCP; pidfile/data-root/exec-root separados)
echo "===> PASO 2/4 · dockerd de pruebas aislado"
pkill -f "dockerd -H $DOCKER_TCP" 2>/dev/null
for i in $(seq 1 10); do (ss -ltn 2>/dev/null | grep -q ':2376 ') || break; sleep 1; done
rm -f /var/run/dockerd-test.pid /root/dockerd-test.log
echo "   Arrancando dockerd en $DOCKER_TCP ..."
nohup dockerd -H "$DOCKER_TCP" --bridge=br-test \
  --pidfile=/var/run/dockerd-test.pid \
  --data-root=/var/lib/docker-test --exec-root=/var/run/docker-test-exec \
  --default-address-pool base=10.211.0.0/16,size=24 \
  >/root/dockerd-test.log 2>&1 &

for i in $(seq 1 45); do docker -H "$DOCKER_TCP" info >/dev/null 2>&1 && break; sleep 1; done
if ! docker -H "$DOCKER_TCP" info >/dev/null 2>&1; then
  echo "!! No arrancó el dockerd de pruebas. Log:"; tail -30 /root/dockerd-test.log; exit 1
fi
echo "   dockerd OK: $(docker -H "$DOCKER_TCP" version --format '{{.Server.Version}} (os={{.Server.Os}})')"

# 3) Testcontainers apunta al daemon de pruebas (props en el HOME del usuario no-root)
echo "===> PASO 3/4 · Apuntando Testcontainers al daemon de pruebas"
printf 'docker.host=%s\nryuk.disabled=true\n' "$DOCKER_TCP" > "$TC_PROPS"
chown "$RUN_USER:$RUN_USER" "$TC_PROPS"
echo "   $TC_PROPS -> docker.host=$DOCKER_TCP"

# 4) Ejecuta la suite como usuario no-root (Mockito self-attach OK)
echo "===> PASO 4/4 · Ejecutando la suite de integración (mvnw test -Pintegration, como $RUN_USER)"
echo ""
su - "$RUN_USER" -c "cd '$PROJECT_DIR' && ./mvnw -Dmaven.repo.local=/home/$RUN_USER/.m2/repository test -Pintegration"
RESULT=$?

# 5) Limpieza: daemon de pruebas + config de Testcontainers
#    Se borra el .testcontainers.properties porque apunta a un daemon que ya no existe;
#    si se dejara, un `./mvnw test -Pintegration` posterior fallaría con el confuso
#    "DOCKER_HOST tcp://127.0.0.1:2376 is not listening".
if [ "$KEEP_DAEMON" = "1" ]; then
  echo ""
  echo ">> KEEP_DAEMON=1 · el dockerd de pruebas sigue vivo en $DOCKER_TCP"
  echo "   Puedes re-ejecutar solo la suite con:"
  echo "     cd '$PROJECT_DIR' && ./mvnw test -Pintegration"
  echo "   Para detenerlo al terminar:  sudo pkill -f 'dockerd -H $DOCKER_TCP'"
else
  kill "$(cat /var/run/dockerd-test.pid 2>/dev/null)" 2>/dev/null
  for i in $(seq 1 15); do (ss -ltn 2>/dev/null | grep -q ':2376 ') || break; sleep 1; done
  rm -f "$TC_PROPS"
fi

echo ""
echo "──────────────────────────────────────────────────────────────"
if [ $RESULT -eq 0 ]; then
  echo ">> INTEGRACIÓN: BUILD SUCCESS"
  echo ">> Captura la salida 'Tests run: 27, Failures: 0, Errors: 0' y 'BUILD SUCCESS'."
else
  echo ">> INTEGRACIÓN: FALLÓ (revisa la salida de maven arriba)"
  echo ">> Recuerda: este script es el único punto de entrada válido;"
  echo "   'mvnw test -Pintegration' por sí solo NO levanta el dockerd de pruebas."
fi
echo "──────────────────────────────────────────────────────────────"
exit $RESULT
