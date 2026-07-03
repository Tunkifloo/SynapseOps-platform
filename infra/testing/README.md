# Pruebas de integración — SynapseOps

`run-integration-tests.sh` ejecuta la suite de **integración** del Backend Orchestrator
(Testcontainers + PostgreSQL 17 + WebTestClient, perfil Maven `integration`) contra un
**dockerd moby aislado** que coexiste con Docker Desktop sin conflictos.

## Por qué este script (entorno Windows/WSL2)
- El Docker del host es **Docker Desktop 29.x**, cuyo API es **incompatible** con el `docker-java 3.3.0`
  que el proyecto fija a propósito (feature DooD de producción) → Testcontainers falla con HTTP 400.
  Un **dockerd moby nativo** sí es compatible; el script levanta uno aislado (bridge `br-test`, solo
  TCP `127.0.0.1:2376`, `data-root`/`exec-root` separados) que no toca a Docker Desktop ni al stack.
- **Mockito** (JDK 21) no puede auto-atacharse si el proceso corre como root → el script ejecuta maven
  como tu usuario normal (no-root). Además el `pom.xml` añade `-Djdk.attach.allowAttachSelf=true`.

## Uso
En tu terminal **WSL**, dentro del repo:
```bash
sudo bash infra/testing/run-integration-tests.sh
```
Captura la salida final: `Tests run: 27, Failures: 0, Errors: 0` y `BUILD SUCCESS`.

## Resultado verificado
```
>> dockerd OK: 26.1.4 (os=linux)
Container postgres:17-alpine started · Flyway → PostgreSQL 17.10
Tests run: 27, Failures: 0, Errors: 0, Skipped: 0
BUILD SUCCESS   (Total time ~2:18 min)
```

## Notas
- El script limpia el daemon de pruebas al terminar. No afecta a `docker compose` ni a Docker Desktop.
- En el CI de Gitea (runner Linux) la suite corre de forma equivalente con el daemon del runner.
