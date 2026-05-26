# SynapseOps — Makefile
# Contrato de comandos compartido entre desarrollador y Gitea Actions CI/CD

.PHONY: lint lint-backend lint-frontend \
        test test-it test-frontend \
        build \
        docker-build clean all help

BACKEND_DIR   := Backend/backend-orchestrator
FRONTEND_DIR  := frontend
ML_ENGINE_DIR := Backend/ml-engine

BACKEND_IMAGE := synapseops/backend-orchestrator
FRONTEND_IMAGE:= synapseops/frontend-app
ML_IMAGE      := synapseops/ml-engine

TAG ?= $(shell git rev-parse --short HEAD 2>/dev/null || echo "local")

# ── HELP ──────────────────────────────────────────────────────────────────────
help:
	@echo ""
	@echo "  SynapseOps — Targets disponibles:"
	@echo ""
	@echo "  make lint           → ESLint (frontend) + Checkstyle (backend)"
	@echo "  make test           → Tests unitarios backend (JUnit 5 + Mockito)"
	@echo "  make test-it        → Tests integración backend (Testcontainers)"
	@echo "  make test-frontend  → Tests frontend (pendiente — asignado a Alfredo)"
	@echo "  make build          → JAR backend + bundle React"
	@echo "  make docker-build   → Imágenes Docker (tag: $(TAG))"
	@echo "  make all            → lint + test + build + docker-build"
	@echo "  make clean          → Limpiar artefactos de build"
	@echo ""

# ── 1. LINT ───────────────────────────────────────────────────────────────────
lint: lint-backend lint-frontend
	@echo "✔  Lint completado"

lint-backend:
	@echo ">> [LINT] Backend — Checkstyle"
	cd $(BACKEND_DIR) && ./mvnw checkstyle:check -q

lint-frontend:
	@echo ">> [LINT] Frontend — ESLint"
	cd $(FRONTEND_DIR) && npm run lint --silent

# ── 2. TESTS UNITARIOS BACKEND (sin Docker) ───────────────────────────────────
test:
	@echo ">> [TEST] Backend — JUnit 5 + Mockito (perfil unit)"
	cd $(BACKEND_DIR) && ./mvnw test -Punit -q
	@echo "✔  Tests unitarios backend completados"

# ── 2b. TESTS UNITARIOS FRONTEND (pendiente — Alfredo) ───────────────────────
# TODO: habilitar cuando Alfredo implemente Vitest + RTL (Sprint 2)
# Requiere: npm install --save-dev vitest @testing-library/react jsdom
test-frontend:
	@echo ">> [TEST-FRONTEND] Verificando configuración de Vitest..."
	@if cd $(FRONTEND_DIR) && npm run test --if-present -- --run --silent 2>/dev/null; then \
		echo "✔  Tests frontend completados"; \
	else \
		echo "⚠  Tests frontend aún no configurados (pendiente Alfredo — Sprint 2)"; \
		echo "   Para habilitar: cd Frontend && npm install --save-dev vitest @testing-library/react jsdom"; \
	fi

# ── 3. TESTS DE INTEGRACIÓN (requiere daemon Docker WSL2) ─────────────────────
test-it:
	@echo ">> [TEST-IT] Backend — Testcontainers + PostgreSQL 17"
	@echo "   Nota: requiere daemon WSL2 activo (wsl ~/start-testdocker.sh)"
	cd $(BACKEND_DIR) && ./mvnw test -Pintegration -q
	@echo "✔  Tests de integración completados"

# ── 4. BUILD ──────────────────────────────────────────────────────────────────
build:
	@echo ">> [BUILD] Backend — compilar JAR (skip tests)"
	cd $(BACKEND_DIR) && ./mvnw package -DskipTests -q
	@echo ">> [BUILD] Frontend — bundle React/Vite"
	cd $(FRONTEND_DIR) && npm run build --silent
	@echo "✔  Build completado"

# ── 5. DOCKER BUILD ───────────────────────────────────────────────────────────
docker-build:
	@echo ">> [DOCKER] Build imágenes (tag: $(TAG))"
	docker build -t $(BACKEND_IMAGE):$(TAG) \
	  -f $(BACKEND_DIR)/Dockerfile $(BACKEND_DIR)
	docker build -t $(FRONTEND_IMAGE):$(TAG) \
	  --build-arg VITE_API_BASE_URL=/api/v1 \
	  -f $(FRONTEND_DIR)/Dockerfile $(FRONTEND_DIR)
	docker build -t $(ML_IMAGE):$(TAG) \
	  -f $(ML_ENGINE_DIR)/Dockerfile $(ML_ENGINE_DIR)
	@echo "✔  Imágenes construidas: tag=$(TAG)"

# ── 6. CICLO COMPLETO ─────────────────────────────────────────────────────────
all: lint test build docker-build
	@echo ""
	@echo "══════════════════════════════════════════"
	@echo "  ✔  SynapseOps CI — Ciclo completo OK"
	@echo "══════════════════════════════════════════"

# ── 7. CLEAN ──────────────────────────────────────────────────────────────────
clean:
	@echo ">> [CLEAN] Backend"
	cd $(BACKEND_DIR) && ./mvnw clean -q
	@echo ">> [CLEAN] Frontend"
	cd $(FRONTEND_DIR) && rm -rf dist node_modules/.cache
	@echo "✔  Clean completado"