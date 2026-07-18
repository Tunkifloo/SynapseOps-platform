# -*- coding: utf-8 -*-
"""E2E — Gestión de usuarios (ADMIN). Sin crear datos persistentes.

Verifica que el módulo de administración carga (tabla + CTA) y que el formulario
de creación valida los campos obligatorios. No se envía ningún usuario real: se
valida y se cancela.
"""
import pytest

import config
from pages.login_page import LoginPage
from pages.app_shell import AppShell
from pages.admin_page import AdminUsersPage


@pytest.fixture()
def admin_session(driver):
    LoginPage(driver).load().login(config.ADMIN_USER, config.ADMIN_PASSWORD)
    AppShell(driver).wait_loaded()
    return AdminUsersPage(driver)


@pytest.mark.e2e
def test_33_gestion_usuarios_carga(admin_session, driver):
    """TC-E2E-33 — 'Gestión de usuarios' carga con la tabla y el CTA de creación."""
    page = admin_session.load()
    assert page.is_present(AdminUsersPage.HEADING), "No cargó la gestión de usuarios"
    assert page.is_present(AdminUsersPage.CREATE_CTA), "No aparece el botón 'Crear usuario'"


@pytest.mark.e2e
def test_34_crear_usuario_valida_requeridos(admin_session, driver):
    """TC-E2E-34 — El formulario de creación valida los campos requeridos (sin persistir)."""
    page = admin_session.load()
    page.open_create()
    page.submit_empty_expect_errors()  # falla si no aparecen los errores
    page.cancel()
    # el diálogo se cierra: la cabecera vuelve a estar accesible
    assert page.is_present(AdminUsersPage.HEADING)
