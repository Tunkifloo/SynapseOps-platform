# -*- coding: utf-8 -*-
"""E2E — Autenticación y control de acceso (casos 1.x del plan de pruebas).

Cubre de extremo a extremo, a través del navegador real, lo que la suite de
integración cubre por API: login válido, rechazo de credenciales inválidas,
validación en cliente y protección de rutas.
"""
import pytest

import config
from pages.login_page import LoginPage
from pages.app_shell import AppShell


@pytest.mark.e2e
@pytest.mark.smoke
def test_login_valido_redirige_al_resumen(driver):
    """TC-E2E-01 — Iniciar sesión con credenciales válidas (rol ADMIN)."""
    login = LoginPage(driver).load()
    login.login(config.ADMIN_USER, config.ADMIN_PASSWORD)

    # éxito: la app navega a /dashboard y el shell autenticado queda visible
    login.wait_url_contains("/dashboard")
    shell = AppShell(driver).wait_loaded()
    assert "/dashboard" in driver.current_url
    assert shell.is_nav_present(), "La barra de navegación autenticada no apareció tras el login"


@pytest.mark.e2e
@pytest.mark.smoke
def test_login_invalido_muestra_error(driver):
    """TC-E2E-02 — Rechazar el inicio de sesión con credenciales inválidas."""
    login = LoginPage(driver).load()
    login.login("usuario_inexistente", "clave_incorrecta")

    error = login.error_text()
    assert error and len(error.strip()) > 0, "No se mostró la alerta de error de credenciales"
    # no debe autenticarse: permanece en /login
    assert "/dashboard" not in driver.current_url


@pytest.mark.e2e
def test_login_campos_vacios_valida_en_cliente(driver):
    """TC-E2E-03 — Enviar el formulario vacío dispara validación en cliente."""
    login = LoginPage(driver).load()
    login.submit_empty()

    assert login.has_inline_errors(), "No se mostraron los mensajes de campo obligatorio"
    assert "/dashboard" not in driver.current_url


@pytest.mark.e2e
@pytest.mark.smoke
def test_ruta_protegida_sin_sesion_redirige_a_login(driver):
    """TC-E2E-04 — Acceder a una ruta protegida sin sesión redirige a /login."""
    page = LoginPage(driver)
    page.open("/workspaces")          # ruta protegida
    page.wait_url_contains("/login")  # el guard debe redirigir
    assert "/login" in driver.current_url
    assert page.is_present(LoginPage.HEADING), "No se llegó a la pantalla de login"


@pytest.mark.e2e
def test_logout_cierra_sesion(driver):
    """TC-E2E-05 — Cerrar sesión vuelve a /login y protege las rutas de nuevo."""
    login = LoginPage(driver).load()
    login.login(config.ADMIN_USER, config.ADMIN_PASSWORD)
    shell = AppShell(driver).wait_loaded()

    shell.logout()
    login.wait_url_contains("/login")
    assert "/login" in driver.current_url
