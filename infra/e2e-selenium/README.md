# Pruebas E2E con Selenium — SynapseOps

Suite de pruebas **end-to-end (E2E)** que maneja un navegador real (Microsoft Edge o
Google Chrome) para verificar los flujos de usuario a través de la interfaz web, tal como
lo pidió el asesor. Complementa a las pruebas de integración por API (Testcontainers) y al
smoke test del stack.

- **Lenguaje:** Python 3.11 · **Framework:** Selenium 4 + pytest
- **Patrón:** Page Object Model (POM) — un objeto por pantalla en `pages/`
- **Driver:** gestionado automáticamente por **Selenium Manager** (no se descarga
  `msedgedriver`/`chromedriver` a mano; se resuelve solo en la primera ejecución).

---

## 1. Estructura

```
infra/e2e-selenium/
├── config.py            # parámetros por variables de entorno (URL, credenciales, navegador)
├── driver_factory.py    # crea el WebDriver (Edge por defecto; Chrome opcional)
├── conftest.py          # fixture 'driver' + captura de pantalla automática al fallar
├── pytest.ini           # configuración de pytest y marcadores (e2e, smoke)
├── requirements.txt
├── pages/               # Page Objects
│   ├── base_page.py
│   ├── login_page.py
│   └── app_shell.py
├── tests/
│   ├── test_autenticacion.py   # login válido/inválido, validación, ruta protegida, logout
│   └── test_navegacion.py      # recorrido por los módulos del ciclo MLOps
└── artifacts/           # capturas de evidencia (se crean al fallar un test)
```

---

## 2. Requisitos previos

1. **Navegador instalado:** Microsoft Edge (ya presente en Windows) o Google Chrome.
2. **La plataforma levantada** y accesible (frontend en `http://localhost:3000`):
   ```powershell
   docker compose up -d --build      # desde la raíz del repositorio
   ```
   Espera a que el frontend responda (abre http://localhost:3000 y verás el login).
3. **Entorno de Python** con las dependencias (ya creado en `infra/e2e-selenium/.venv`).
   Para recrearlo desde cero:
   ```powershell
   cd infra\e2e-selenium
   python -m venv .venv
   .\.venv\Scripts\python.exe -m pip install -r requirements.txt
   ```

> La primera ejecución necesita **internet una sola vez** para que Selenium Manager
> descargue el driver del navegador; luego queda cacheado en el equipo.

---

## 3. Ejecución

Desde `infra/e2e-selenium/` (PowerShell), con la plataforma arriba:

```powershell
# Toda la suite (headless, Edge por defecto)
.\.venv\Scripts\python.exe -m pytest

# Solo el subconjunto rápido y determinista (recomendado para evidenciar)
.\.venv\Scripts\python.exe -m pytest -m smoke

# Ver el navegador en vivo (útil para grabar la evidencia)
$env:E2E_HEADLESS="0"; .\.venv\Scripts\python.exe -m pytest -m smoke

# Reporte HTML (para adjuntar como evidencia)
.\.venv\Scripts\python.exe -m pytest -m smoke --html=artifacts\reporte-e2e.html --self-contained-html
```

### Variables de entorno (todas opcionales)

| Variable | Por defecto | Descripción |
|---|---|---|
| `E2E_BASE_URL` | `http://localhost:3000` | URL del frontend bajo prueba |
| `E2E_ADMIN_USER` | `superadmin` | Usuario admin sembrado |
| `E2E_ADMIN_PASSWORD` | `admin123!` | Contraseña admin (ajústala a tu `.env`) |
| `E2E_BROWSER` | `edge` | `edge` o `chrome` |
| `E2E_HEADLESS` | `1` | `1` sin ventana · `0` con ventana |
| `E2E_WAIT_TIMEOUT` | `20` | Espera máxima (s) por elemento |

Ejemplo apuntando al frontend publicado (GitHub Pages + ngrok) en Chrome, con ventana:
```powershell
$env:E2E_BASE_URL="https://<tu-usuario>.github.io/SynapseOps"
$env:E2E_BROWSER="chrome"; $env:E2E_HEADLESS="0"
.\.venv\Scripts\python.exe -m pytest -m smoke
```

---

## 4. Casos cubiertos (24)

| ID | Caso | Archivo |
|---|---|---|
| TC-E2E-01 | Login válido (ADMIN) → redirige al Resumen | `test_autenticacion.py` |
| TC-E2E-02 | Login inválido → muestra alerta de error | `test_autenticacion.py` |
| TC-E2E-03 | Formulario vacío → validación en cliente | `test_autenticacion.py` |
| TC-E2E-04 | Ruta protegida sin sesión → redirige a /login | `test_autenticacion.py` |
| TC-E2E-05 | Cerrar sesión → vuelve a /login | `test_autenticacion.py` |
| TC-E2E-06..12 | Navegar por los 7 módulos del ciclo MLOps | `test_navegacion.py` |
| TC-E2E-13 | Crear un espacio de trabajo → aparece listado | `test_workspaces.py` |
| TC-E2E-14 | Validar nombre obligatorio del proyecto | `test_workspaces.py` |
| TC-E2E-15 | Buscar un espacio por nombre | `test_workspaces.py` |
| TC-E2E-16 | Búsqueda sin coincidencias → estado vacío | `test_workspaces.py` |
| TC-E2E-17 | Filtrar por la pestaña "Sin dataset" | `test_workspaces.py` |
| TC-E2E-18 | Abrir el detalle (drawer con métricas) | `test_workspaces.py` |
| TC-E2E-19 | Editar y renombrar un espacio | `test_workspaces.py` |
| TC-E2E-20 | Eliminar un espacio (con confirmación) | `test_workspaces.py` |
| TC-E2E-21 | Alternar tema claro/oscuro y persistirlo | `test_ui_general.py` |
| TC-E2E-22 | Ver "Mi perfil" con el correo del usuario | `test_ui_general.py` |
| TC-E2E-23 | Persistencia de sesión al recargar | `test_ui_general.py` |
| TC-E2E-24 | Mostrar/ocultar la contraseña en el login | `test_ui_general.py` |

Los casos de ciclo de vida (`test_workspaces.py`) crean un espacio con nombre único por
corrida y lo **limpian automáticamente** al terminar. El flujo completo de entrenamiento
(lienzo → entrenamiento → despliegue → predicción → monitoreo) es de larga duración y depende
de GPU/datos; se mantiene como **guion E2E asistido** en
`docs/testing/06-pruebas-funcionalidad.md`.

---

## 5. Evidencia (para Notion)

- Al **fallar** un test, se guarda automáticamente una captura en `artifacts/FAIL_<test>.png`.
- El **reporte HTML** (`--html`) consolida el resultado de toda la corrida.
- Para las capturas del documento, ejecuta con `E2E_HEADLESS=0` y captura la ventana del
  navegador en cada caso, o adjunta el reporte HTML y la salida `passed` de la consola.
