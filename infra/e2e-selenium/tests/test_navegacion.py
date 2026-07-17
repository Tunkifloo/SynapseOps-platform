# -*- coding: utf-8 -*-
"""E2E — Navegación entre los módulos de la plataforma (rol ADMIN).

Verifica que, con sesión iniciada, el usuario puede recorrer los módulos
principales del ciclo MLOps desde la barra lateral y que cada uno carga.
"""
import pytest

import config
from pages.login_page import LoginPage
from pages.app_shell import AppShell


MODULOS = [
    ("Espacios de trabajo", "/workspaces"),
    ("Lienzo", "/builder"),
    ("Mis modelos", "/models"),
    ("Gestión de Dataset", "/datasets"),
    ("Despliegues", "/deployments"),
    ("Monitoreo", "/monitoring"),
    ("Resumen", "/dashboard"),
]


@pytest.fixture()
def sesion_admin(driver):
    """Inicia sesión como ADMIN y devuelve el shell autenticado."""
    LoginPage(driver).load().login(config.ADMIN_USER, config.ADMIN_PASSWORD)
    return AppShell(driver).wait_loaded()


@pytest.mark.e2e
@pytest.mark.parametrize("label,ruta", MODULOS)
def test_navegar_a_modulo(sesion_admin, driver, label, ruta):
    """TC-E2E-06..12 — Cada módulo del menú principal es accesible y navega."""
    sesion_admin.go_to(label)
    sesion_admin.wait_url_contains(ruta)
    assert ruta in driver.current_url
    assert sesion_admin.is_nav_present(), f"El shell se perdió al navegar a {label}"
