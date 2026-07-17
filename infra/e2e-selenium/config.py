# -*- coding: utf-8 -*-
"""Configuración central de la suite E2E (Selenium) de SynapseOps.

Todo se parametriza por variables de entorno para poder correr la misma suite
contra local (docker compose) o contra el frontend publicado (GitHub Pages + ngrok).
"""
import os

# URL base del frontend bajo prueba (sin barra final).
BASE_URL = os.getenv("E2E_BASE_URL", "http://localhost:3000").rstrip("/")

# Credenciales del administrador sembrado (DatabaseSeeder.java). Se pueden sobrescribir.
ADMIN_USER = os.getenv("E2E_ADMIN_USER", "superadmin")
ADMIN_PASSWORD = os.getenv("E2E_ADMIN_PASSWORD", "admin123!")

# Navegador: "edge" (por defecto, disponible en el equipo) o "chrome".
BROWSER = os.getenv("E2E_BROWSER", "edge").lower()

# Headless: "1" (por defecto, sin ventana) o "0" para ver el navegador en vivo.
HEADLESS = os.getenv("E2E_HEADLESS", "1") == "1"

# Tiempos de espera (segundos).
WAIT_TIMEOUT = int(os.getenv("E2E_WAIT_TIMEOUT", "20"))
PAGE_LOAD_TIMEOUT = int(os.getenv("E2E_PAGE_LOAD_TIMEOUT", "40"))

# Carpeta de evidencias (capturas de pantalla).
ARTIFACTS_DIR = os.getenv("E2E_ARTIFACTS_DIR", os.path.join(os.path.dirname(__file__), "artifacts"))
