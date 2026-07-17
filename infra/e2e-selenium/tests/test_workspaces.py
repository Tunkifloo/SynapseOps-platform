# -*- coding: utf-8 -*-
"""E2E — Ciclo de vida de un Espacio de trabajo a través de la interfaz.

Cubre el CRUD completo por la UI (crear, validar, buscar, filtrar, ver detalle,
editar y eliminar). Los métodos se ejecutan en orden dentro de la clase y comparten
un único navegador con sesión iniciada; el espacio se crea con un nombre único por
corrida (UUID) y se limpia al final.
"""
import uuid

import pytest

import config
from driver_factory import build_driver
from pages.login_page import LoginPage
from pages.app_shell import AppShell
from pages.workspaces_page import WorkspacesPage

PREFIX = "E2E-"


@pytest.fixture(scope="class")
def ws_ctx(request):
    """Navegador + login (una vez) + nombre único; limpia espacios 'E2E-*' al terminar."""
    driver = build_driver()
    ctx = {"driver": driver, "name": f"{PREFIX}{uuid.uuid4().hex[:8]}"}
    try:
        LoginPage(driver).load().login(config.ADMIN_USER, config.ADMIN_PASSWORD)
        AppShell(driver).wait_loaded()
        request.cls.ctx = ctx
        yield ctx
    finally:
        try:
            WorkspacesPage(driver).delete_all_with_prefix(PREFIX)
        except Exception:
            pass
        driver.quit()


@pytest.mark.e2e
@pytest.mark.usefixtures("ws_ctx")
class TestWorkspaceLifecycle:
    @property
    def page(self):
        return WorkspacesPage(self.ctx["driver"])

    def test_13_crear_espacio(self):
        """TC-E2E-13 — Crear un espacio de trabajo y verlo listado."""
        name = self.ctx["name"]
        self.page.load().create(name, "Proyecto de prueba automatizada E2E")
        assert self.page.has_card(name), "La tarjeta del espacio creado no aparece en el listado"

    def test_14_validacion_nombre_obligatorio(self):
        """TC-E2E-14 — El formulario exige el nombre del proyecto."""
        p = self.page.load()
        p.open_create()
        p.submit_empty_expect_error()  # falla la aserción si no aparece el error
        p.click(WorkspacesPage.CANCEL)

    def test_15_buscar_por_nombre(self):
        """TC-E2E-15 — Buscar el espacio por nombre lo mantiene visible."""
        name = self.ctx["name"]
        shell = AppShell(self.ctx["driver"])
        self.page.load()
        shell.search(name)
        assert self.page.has_card(name), "La búsqueda por nombre no muestra el espacio"
        shell.clear_search()

    def test_16_buscar_sin_coincidencias(self):
        """TC-E2E-16 — Un término inexistente muestra el estado vacío."""
        shell = AppShell(self.ctx["driver"])
        self.page.load()
        shell.search("zzz-inexistente-" + uuid.uuid4().hex[:6])
        assert self.page.is_present(WorkspacesPage.EMPTY_MSG, timeout=8), \
            "No se mostró el mensaje 'Sin coincidencias para tu búsqueda.'"
        shell.clear_search()

    def test_17_filtro_pestana_sin_dataset(self):
        """TC-E2E-17 — El filtro 'Sin dataset' incluye el espacio recién creado."""
        name = self.ctx["name"]
        p = self.page.load()
        p.select_tab("Sin dataset")
        assert p.has_card(name), "El espacio sin dataset no aparece bajo la pestaña 'Sin dataset'"
        p.select_tab("Todos")

    def test_18_abrir_detalle(self):
        """TC-E2E-18 — El detalle (drawer) muestra las métricas del espacio."""
        name = self.ctx["name"]
        p = self.page.load()
        p.open_detail(name)  # falla si no aparece el panel con 'Pipelines'

    def test_19_editar_renombrar(self):
        """TC-E2E-19 — Editar el espacio y renombrarlo se refleja en el listado."""
        old = self.ctx["name"]
        new = f"{PREFIX}ren-{uuid.uuid4().hex[:6]}"
        self.page.load().edit_rename(old, new)
        self.ctx["name"] = new
        assert self.page.has_card(new), "El espacio no refleja el nuevo nombre tras editar"

    def test_20_eliminar_espacio(self):
        """TC-E2E-20 — Eliminar el espacio lo quita del listado."""
        name = self.ctx["name"]
        self.page.load().delete(name)
        assert not self.page.has_card(name, timeout=4), "El espacio sigue visible tras eliminarlo"
