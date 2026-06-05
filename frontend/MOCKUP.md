# SynapseOps — Mockup funcional

```mermaid
flowchart TD
    LOGIN[Login]
    DASH[Dashboard]
    ADMIN[Admin Users]
    PROJ[My Projects]
    FORBIDDEN[Forbidden]

    LOGIN -->|auth ok| DASH
    DASH -->|admin| ADMIN
    DASH -->|colaborador| PROJ
    ADMIN -->|crear| ADMIN
    ADMIN -->|editar| ADMIN
    ADMIN -->|toggle| ADMIN
    PROJ -->|crear| PROJ
    PROJ -->|editar| PROJ
    PROJ -->|eliminar| PROJ
    PROJ -->|seleccionar| DATASET[Dataset panel]
    PROJ -->|seleccionar| PIPE[Pipelines panel]
    DATASET -->|upload| PROJ
    DATASET -->|delete| PROJ
    PIPE -->|create| PROJ
    PIPE -->|rename| PROJ
    PIPE -->|delete| PROJ
    ADMIN -.->|sin rol| FORBIDDEN
```

---

## 1. Login

```mermaid
sequenceDiagram
    participant U as Usuario
    participant F as LoginPage
    participant S as AuthService
    participant B as Backend /auth/login

    U->>F: ingresa username + password
    F->>S: login(credential, password)
    S->>B: POST { username, password }
    B-->>S: { token }
    S->>F: persistSession(token)
    F->>U: redirect /dashboard
```

**Componentes implementados:**
| Archivo | Rol |
|---|---|
| `modules/auth/pages/LoginPage.tsx` | Orquestación del login |
| `features/auth/components/LoginForm.tsx` | UI del formulario |
| `features/auth/api.ts` | `login()`, `logout()` |
| `features/auth/auth.mapper.ts` | `parseJwtClaims`, `mapTokenToSessionUser` |
| `features/auth/hooks/useAuthSession.ts` | `persistSession`, `clearAuth` |

---

## 2. Dashboard

```mermaid
sequenceDiagram
    participant U as Usuario
    participant D as DashboardPage
    participant W as WorkspacesAPI
    participant B as Backend /workspaces

    U->>D: entra a /dashboard
    D->>W: listMyWorkspaces(token)
    W->>B: GET /workspaces
    B-->>W: WorkspaceSummary[]
    W-->>D: lista de workspaces
    D->>U: render stats + workspaces
```

**Componentes implementados:**
| Archivo | Rol |
|---|---|
| `modules/dashboard/pages/DashboardPage.tsx` | Vista de resumen |
| `features/workspaces/api.ts` | `listMyWorkspaces` |
| `shared/layout/AppShell.tsx` | Sidebar, header, logout |
| `features/auth/hooks/useProtectedSession.ts` | Sesión, 401/403, logout |

---

## 3. Admin Users

```mermaid
sequenceDiagram
    participant A as AdminUsersPage
    participant U as UsersAPI
    participant R as RegisterAPI
    participant B as Backend

    A->>U: listCollaborators(token)
    U->>B: GET /users/role/COLLABORATOR
    B-->>U: UserSummary[]
    U-->>A: tabla activos

    A->>U: listDisabledUsers(token)
    U->>B: GET /users/disabled
    B-->>U: UserSummary[] (filtrado)
    U-->>A: tabla deshabilitados

    Note over A: Crear estudiante
    A->>R: createStudent(token, form)
    R->>B: POST /auth/register {..., studentCode, career}
    B-->>R: { token }
    R-->>A: refresh tablas

    Note over A: Editar estudiante
    A->>U: getUserById(token, id)
    U->>B: GET /users/{id}
    B-->>U: UserSummary
    U-->>A: llena editForm
    A->>U: updateUserByAdmin(token, id, payload)
    U->>B: PUT /users/{id}
    B-->>U: UserSummary
    U-->>A: refresh tablas

    Note over A: Soft delete (idempotente)
    A->>U: setUserStatus(token, id, enabled)
    U->>B: PATCH /users/{id}  {enabled}
    B-->>U: UserSummary
    U-->>A: refresh tablas
```

**Componentes implementados:**
| Archivo | Rol |
|---|---|
| `modules/users/pages/AdminUsersPage.tsx` | Orquestación |
| `features/admin-users/api.ts` | Todos los endpoints de users |
| `features/admin-users/components/CreateStudentForm.tsx` | Form alta con studentCode + career |
| `features/admin-users/components/EditStudentForm.tsx` | Form edición |
| `features/admin-users/components/UsersTable.tsx` | Tabla activos/deshabilitados |
| `features/admin-users/types.ts` | Tipos con studentCode, career, mapeo carrer |

---

## 4. My Projects

```mermaid
sequenceDiagram
    participant W as WorkspacesPage
    participant A as WorkspacesAPI
    participant B as Backend

    W->>A: listMyWorkspaces(token)
    A->>B: GET /workspaces
    B-->>A: WorkspaceSummary[]
    A-->>W: tabla proyectos

    Note over W: Crear
    W->>A: createWorkspace(token, form)
    A->>B: POST /workspaces { name, description }
    B-->>A: WorkspaceSummary
    A-->>W: refresh + seleccionar

    Note over W: Editar
    W->>A: updateWorkspace(token, id, form)
    A->>B: PUT /workspaces/{id} { name, description }
    B-->>A: WorkspaceSummary
    A-->>W: refresh

    Note over W: Eliminar
    W->>A: deleteWorkspace(token, id)
    A->>B: DELETE /workspaces/{id}
    B-->>A: void
    A-->>W: refresh

    Note over W: Seleccionar
    W->>W: selectWorkspace(ws)
    W->>A: listWorkspacePipelines(token, wsId)
    A->>B: GET /workspaces/{id}/pipelines
    B-->>A: PipelineSummary[]
    A-->>W: panel pipelines
```

**Componentes implementados:**
| Archivo | Rol |
|---|---|
| `modules/workspaces/pages/WorkspacesPage.tsx` | Orquestación completa |
| `features/workspaces/api.ts` | list, create, update, delete |
| `features/workspaces/components/WorkspaceForm.tsx` | Form crear/editar |
| `features/workspaces/components/WorkspacesTable.tsx` | Tabla de proyectos |
| `features/workspaces/components/DatasetPanel.tsx` | Upload/delete dataset |
| `features/workspaces/components/PipelinesPanel.tsx` | CRUD pipelines |
| `features/workspaces/types.ts` | Tipos del módulo |

---

## 5. Dataset

```mermaid
sequenceDiagram
    participant P as WorkspacesPage
    participant D as DatasetPanel
    participant A as WorkspacesAPI
    participant B as Backend

    Note over P: Upload
    D->>A: uploadDataset(token, wsId, file)
    A->>B: POST /workspaces/{wsId}/dataset (multipart)
    B-->>A: path string
    A-->>D: mensaje + refresh workspaces

    Note over P: Delete
    D->>A: deleteDataset(token, wsId, filename)
    A->>B: DELETE /workspaces/{wsId}/dataset/{filename}
    B-->>A: void
    A-->>D: refresh workspaces
```

---

## 6. Pipelines

```mermaid
sequenceDiagram
    participant P as WorkspacesPage
    participant L as PipelinesPanel
    participant A as WorkspacesAPI
    participant B as Backend

    P->>A: listWorkspacePipelines(token, wsId)
    A->>B: GET /workspaces/{wsId}/pipelines
    B-->>A: PipelineSummary[]
    A-->>L: lista pipelines

    Note over L: Create
    L->>A: createPipeline(token, wsId, payload)
    A->>B: POST /workspaces/{wsId}/pipelines { name }
    B-->>A: PipelineSummary
    A-->>L: refresh pipelines

    Note over L: Rename
    L->>A: renamePipeline(token, wsId, pid, name)
    A->>B: PATCH /workspaces/{wsId}/pipelines/{pid}/rename { name }
    B-->>A: PipelineSummary
    A-->>L: refresh pipelines

    Note over L: Delete
    L->>A: deletePipeline(token, wsId, pid)
    A->>B: DELETE /workspaces/{wsId}/pipelines/{pid}
    B-->>A: void
    A-->>L: refresh pipelines
```

---

## 7. Forbidden

```mermaid
sequenceDiagram
    participant U as Usuario
    participant G as RoleRoute/useProtectedSession
    participant F as ForbiddenPage

    U->>G: intenta /admin sin rol ADMIN
    G->>F: redirect /forbidden (403)
    F->>U: "Acceso restringido — HTTP 403 Forbidden"
```

**Componentes implementados:**
| Archivo | Rol |
|---|---|
| `routes/ProtectedRoute.tsx` | Bloquea si no está autenticado |
| `routes/RoleRoute.tsx` | Bloquea si no tiene el rol requerido |
| `pages/ForbiddenPage.tsx` | Pantalla 403 |

---

## Estructura del frontend

```mermaid
graph TD
    APP[App.tsx]
    ROUTER[app/router/AppRouter.tsx]
    SHELL[shared/layout/AppShell.tsx]
    STORE[store/useAppStore.ts]
    PROT[routes/ProtectedRoute.tsx]
    ROLE[routes/RoleRoute.tsx]

    APP --> ROUTER
    ROUTER --> PROT
    ROUTER --> ROLE
    ROUTER --> LOGIN_P[modules/auth/pages/LoginPage.tsx]
    ROUTER --> DASH_P[modules/dashboard/pages/DashboardPage.tsx]
    ROUTER --> ADMIN_P[modules/users/pages/AdminUsersPage.tsx]
    ROUTER --> WS_P[modules/workspaces/pages/WorkspacesPage.tsx]
    ROUTER --> FORBIDDEN[pages/ForbiddenPage.tsx]

    PROT --> SHELL
    ROLE --> SHELL
    SHELL --> STORE

    subgraph Auth
        LOGIN_P --> AUTH_API[features/auth/api.ts]
        LOGIN_P --> AUTH_FORM[features/auth/components/LoginForm.tsx]
        LOGIN_P --> AUTH_HOOK[features/auth/hooks/useAuthSession.ts]
        SHELL --> PROT_SESS[features/auth/hooks/useProtectedSession.ts]
    end

    subgraph Users
        ADMIN_P --> USERS_API[features/admin-users/api.ts]
        ADMIN_P --> CREATE_F[features/admin-users/components/CreateStudentForm.tsx]
        ADMIN_P --> EDIT_F[features/admin-users/components/EditStudentForm.tsx]
        ADMIN_P --> TABLE[features/admin-users/components/UsersTable.tsx]
    end

    subgraph Workspaces
        WS_P --> WS_API[features/workspaces/api.ts]
        WS_P --> WS_FORM[features/workspaces/components/WorkspaceForm.tsx]
        WS_P --> WS_TABLE[features/workspaces/components/WorkspacesTable.tsx]
        WS_P --> DS_PANEL[features/workspaces/components/DatasetPanel.tsx]
        WS_P --> PIPE_PANEL[features/workspaces/components/PipelinesPanel.tsx]
    end

    subgraph Shared
        SHELL --> API_CLIENT[shared/api/client.ts]
        SHELL --> API_ENV[shared/api/env.ts]
    end
```
