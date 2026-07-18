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

### Modo pausado para grabar un video de evidencia

Para grabar la pantalla mientras se ejecutan las pruebas, activa el **modo pausado**: el
navegador se ve, cada paso se resalta en naranja y hay una pausa configurable tras cada
interacción (clic/escritura/navegación).

```powershell
# Ventana visible + pausa de 800 ms por paso + resaltado (ideal para grabar)
$env:E2E_HEADLESS="0"; $env:E2E_SLOWMO_MS="800"
.\.venv\Scripts\python.exe -m pytest -m smoke

# Un solo archivo, aún más lento (1 s por paso), para una toma limpia
$env:E2E_SLOWMO_MS="1000"
.\.venv\Scripts\python.exe -m pytest tests\test_workspaces.py
```

> `E2E_SLOWMO_MS` = milisegundos de pausa tras cada paso (0 = rápido, por defecto).
> `E2E_HIGHLIGHT=0` desactiva el resaltado naranja si prefieres una toma sin marcas.
> Recuerda volver a `$env:E2E_SLOWMO_MS="0"` (o cerrar la terminal) para las corridas normales.

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

## 4. Casos cubiertos (35)
**Autenticación y control de acceso** (`test_autenticacion.py`)
| ID | Caso de uso | Resultado esperado |
|---|---|---|
| TC-E2E-01 | Iniciar sesión con credenciales válidas (ADMIN) | Redirige a `/dashboard`; aparece la barra de navegación |
| TC-E2E-02 | Iniciar sesión con credenciales inválidas | Se muestra la alerta de error; permanece sin autenticar |
| TC-E2E-03 | Enviar el formulario de login vacío | Se muestran los mensajes de campo obligatorio (validación en cliente) |
| TC-E2E-04 | Acceder a `/workspaces` sin sesión | El guard redirige a `/login` |
| TC-E2E-05 | Cerrar sesión | Vuelve a `/login` |

**Navegación** (`test_navegacion.py`)
| ID | Caso de uso | Resultado esperado |
|---|---|---|
| TC-E2E-06..12 | Navegar por los módulos (Espacios, Lienzo, Modelos, Datasets, Despliegues, Monitoreo, Resumen) | Cada módulo carga y conserva el shell |

**Comportamientos transversales** (`test_ui_general.py`)
| ID | Caso de uso | Resultado esperado |
|---|---|---|
| TC-E2E-21 | Alternar tema claro/oscuro | Cambia `.dark` en `<html>` y persiste tras recargar (localStorage) |
| TC-E2E-22 | Ver "Mi perfil" | Carga la pantalla y muestra el correo del usuario |
| TC-E2E-23 | Persistencia de sesión al recargar | La sesión se mantiene (no redirige a `/login`) |
| TC-E2E-24 | Mostrar/ocultar la contraseña en el login | El campo alterna entre `password` y `text` |

**Autenticación — profundidad** (`test_auth_extra.py`)
| ID | Caso de uso | Resultado esperado |
|---|---|---|
| TC-E2E-25 | Login → Registro (enlace "Regístrate") | Abre `/signup` |
| TC-E2E-26 | Validación del formulario de registro | Muestra errores; vuelve a `/login` |
| TC-E2E-27 | Login → "¿Olvidaste tu contraseña?" | Abre `/forgot-password` |
| TC-E2E-28 | Raíz `/` sin sesión | Redirige a `/login` |

**Módulos con estado — profundidad** (`test_builder_search.py`, `test_workspaces_extra.py`, `test_admin.py`)
| ID | Caso de uso | Resultado esperado |
|---|---|---|
| TC-E2E-29 | Crear espacio con descripción | La descripción aparece en el panel de detalle |
| TC-E2E-30 | Cancelar la creación de un espacio | No se crea ningún espacio |
| TC-E2E-31 | Búsqueda global de comandos | Sugiere acciones y navega al elegir una |
| TC-E2E-32 | Abrir el Lienzo desde un espacio | Carga el editor "Lienzo del pipeline" |
| TC-E2E-33 | Cargar "Gestión de usuarios" (ADMIN) | Muestra la tabla y el CTA "Crear usuario" |
| TC-E2E-34 | Validar el formulario de creación de usuario | Muestra errores; se cancela sin crear (sin persistencia) |
| TC-E2E-35 | Abrir el modal "Cambiar contraseña" | Aparece el modal con sus campos (sin enviar) |

**Ciclo de vida de un Espacio de trabajo — CRUD por la UI** (`test_workspaces.py`)
| ID | Caso de uso | Resultado esperado |
|---|---|---|
| TC-E2E-13 | Crear un espacio de trabajo | La tarjeta aparece en el listado |
| TC-E2E-14 | Validar el nombre obligatorio | Se muestra el error y no se crea |
| TC-E2E-15 | Buscar un espacio por nombre | La tarjeta coincidente permanece visible |
| TC-E2E-16 | Búsqueda sin coincidencias | Se muestra "Sin coincidencias para tu búsqueda." |
| TC-E2E-17 | Filtrar por la pestaña "Sin dataset" | El espacio recién creado aparece |
| TC-E2E-18 | Abrir el detalle (drawer) | Muestra las métricas (Pipelines, Modelos) |
| TC-E2E-19 | Editar y renombrar | El listado refleja el nuevo nombre |
| TC-E2E-20 | Eliminar (con confirmación) | La tarjeta desaparece del listado |

> Estos casos se ejecutan en orden compartiendo un navegador con sesión iniciada; el espacio
> se crea con un nombre único por corrida (UUID) y se **limpia automáticamente** al terminar.

> El flujo completo de entrenamiento (lienzo → entrenamiento → despliegue → predicción →
> monitoreo) es de larga duración y depende de datos/GPU; se mantiene como **guion E2E
> asistido** en [06 — Funcionalidad](06-pruebas-funcionalidad.md). Esta suite automatiza los
> recorridos deterministas de la interfaz, que son los idóneos para regresión repetible.


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
