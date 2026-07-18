# -*- coding: utf-8 -*-
"""E2E — Casos adicionales del espacio de trabajo (descripción y cancelación)."""
import uuid

import pytest
from selenium.webdriver.common.by import By

import config
from pages.login_page import LoginPage
from pages.app_shell import AppShell
from pages.workspaces_page import WorkspacesPage

PREFIX = "E2E-"


@pytest.fixture()
def ws_page(driver):
    LoginPage(driver).load().login(config.ADMIN_USER, config.ADMIN_PASSWORD)
    AppShell(driver).wait_loaded()
    page = WorkspacesPage(driver)
    yield page
    try:
        page.delete_all_with_prefix(PREFIX)
    except Exception:
        pass


@pytest.mark.e2e
def test_29_crear_con_descripcion_visible_en_detalle(ws_page, driver):
    """TC-E2E-29 — La descripción del espacio se muestra en el panel de detalle."""
    name = f"{PREFIX}{uuid.uuid4().hex[:8]}"
    desc = "Descripción de prueba E2E " + uuid.uuid4().hex[:6]
    ws_page.load().create(name, desc)
    ws_page.open_detail(name)
    assert ws_page.is_present((By.XPATH, f"//*[contains(normalize-space(),'{desc}')]")), \
        "La descripción no aparece en el detalle del espacio"


@pytest.mark.e2e
def test_30_cancelar_creacion_no_crea(ws_page, driver):
    """TC-E2E-30 — Cancelar el formulario de creación no crea ningún espacio."""
    name = f"{PREFIX}cancel-{uuid.uuid4().hex[:6]}"
    p = ws_page.load()
    p.open_create()
    p.type(WorkspacesPage.NAME, name)
    p.click(WorkspacesPage.CANCEL)
    # recargar para descartar el estado del modal y confirmar que no se creó nada
    p.load()
    assert not p.has_card(name, timeout=4), "Se creó el espacio pese a cancelar"
