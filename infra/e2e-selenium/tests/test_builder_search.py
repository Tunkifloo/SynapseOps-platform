# -*- coding: utf-8 -*-
"""E2E — Lienzo del pipeline, búsqueda global y modal de perfil.

Casos de profundidad que recorren módulos con estado (lienzo, búsqueda de comandos,
cambio de contraseña) sin efectos persistentes.
"""
import uuid

import pytest
from selenium.webdriver.common.by import By

import config
from pages.login_page import LoginPage
from pages.app_shell import AppShell
from pages.workspaces_page import WorkspacesPage
from pages.profile_page import ProfilePage

PREFIX = "E2E-"


@pytest.fixture()
def logged(driver):
    LoginPage(driver).load().login(config.ADMIN_USER, config.ADMIN_PASSWORD)
    return AppShell(driver).wait_loaded()


@pytest.mark.e2e
def test_31_busqueda_de_comandos_navega(logged, driver):
    """TC-E2E-31 — La búsqueda global sugiere acciones y navega al elegir una."""
    driver.get(f"{config.BASE_URL}/dashboard")
    logged.wait_loaded()
    shell = AppShell(driver)
    shell.search("Despliegues")
    # el desplegable "Acciones" muestra resultados; elegir el de Despliegues
    result = (By.XPATH, "//div[.//p[normalize-space()='Acciones']]//button[.//span[normalize-space()='Despliegues']]")
    shell.click(result)
    shell.wait_url_contains("/deployments")
    assert "/deployments" in driver.current_url


@pytest.mark.e2e
def test_32_abrir_lienzo_desde_workspace(logged, driver):
    """TC-E2E-32 — Abrir el Lienzo desde un espacio carga el editor del pipeline."""
    ws = WorkspacesPage(driver)
    name = f"{PREFIX}{uuid.uuid4().hex[:8]}"
    try:
        ws.load().create(name, "Espacio para abrir el lienzo")
        ws.open_detail(name)
        # botón del drawer "Abrir en el Lienzo"
        ws.click((By.XPATH, "//button[normalize-space()='Abrir en el Lienzo']"))
        ws.wait_url_contains("/builder")
        assert ws.is_present((By.XPATH, "//*[normalize-space()='Lienzo del pipeline']")), \
            "No cargó el encabezado del Lienzo"
    finally:
        try:
            WorkspacesPage(driver).delete_all_with_prefix(PREFIX)
        except Exception:
            pass


@pytest.mark.e2e
def test_35_abrir_modal_cambiar_contrasena(logged, driver):
    """TC-E2E-35 — En el perfil, el modal 'Cambiar contraseña' se abre con sus campos."""
    profile = ProfilePage(driver).load()
    profile.click((By.XPATH, "//button[normalize-space()='Cambiar contraseña']"))
    assert profile.is_present((By.ID, "currentPassword")), "No apareció el modal de cambio de contraseña"
    assert profile.is_present((By.ID, "newPassword"))
    # cerrar sin enviar
    profile.click((By.XPATH, "//div[@role='dialog']//button[normalize-space()='Cancelar']"))
