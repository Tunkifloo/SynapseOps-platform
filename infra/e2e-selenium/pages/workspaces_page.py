# -*- coding: utf-8 -*-
"""Page Object de "Espacios de trabajo" (/workspaces).

Selectores tomados de:
  - WorkspacesPage.tsx: CTA "Crear nuevo espacio"; tarjetas [data-tour='workspace-item'];
    pestañas "Todos/Con dataset/Sin dataset"; acciones por tarjeta
    (aria-label "Editar proyecto" / "Eliminar proyecto"); drawer con "Pipelines/Modelos";
    ConfirmDialog "Eliminar proyecto"; mensaje vacío "Sin coincidencias para tu búsqueda.".
  - WorkspaceForm.tsx: inputs #ws-name / #ws-desc; submit "Crear proyecto" / "Guardar cambios".
"""
from selenium.webdriver.common.by import By

from pages.base_page import BasePage


class WorkspacesPage(BasePage):
    HEADING = (By.XPATH, "//*[normalize-space()='Espacios de trabajo']")
    CREATE_CTA = (By.XPATH, "//button[normalize-space()='Crear nuevo espacio']")
    CARD = (By.CSS_SELECTOR, "[data-tour='workspace-item']")
    EMPTY_MSG = (By.XPATH, "//*[contains(text(),'Sin coincidencias para tu búsqueda')]")

    # formulario (modal)
    NAME = (By.ID, "ws-name")
    DESC = (By.ID, "ws-desc")
    SUBMIT_CREATE = (By.XPATH, "//button[normalize-space()='Crear proyecto']")
    SUBMIT_SAVE = (By.XPATH, "//button[normalize-space()='Guardar cambios']")
    NAME_ERROR = (By.XPATH, "//p[contains(text(),'El nombre del proyecto es obligatorio')]")
    CANCEL = (By.XPATH, "//button[normalize-space()='Cancelar']")

    # botones del drawer de detalle (siempre visibles al abrir el detalle)
    DRAWER_EDIT = (By.XPATH, "//button[normalize-space()='Editar']")
    DRAWER_DELETE = (By.XPATH, "//button[normalize-space()='Eliminar']")
    # confirmación de borrado
    CONFIRM_DELETE = (By.XPATH, "//button[normalize-space()='Eliminar proyecto' and ancestor::*[@role='dialog' or @role='alertdialog']]")

    def load(self):
        self.open("/workspaces")
        self.wait_visible(self.HEADING)
        return self

    # ── localizadores dinámicos por nombre ────────────────────────────────
    def card_by_name(self, name):
        return (By.XPATH, f"//*[@data-tour='workspace-item'][.//p[normalize-space()='{name}']]")

    def tab(self, label):
        return (By.XPATH, f"//button[.//text()[normalize-space()='{label}']][contains(@class,'rounded-lg')]")

    # ── acciones ──────────────────────────────────────────────────────────
    def open_create(self):
        self.click(self.CREATE_CTA)
        self.wait_visible(self.NAME)
        return self

    def fill_and_submit(self, name, description=""):
        self.type(self.NAME, name)
        if description:
            self.type(self.DESC, description)
        self.click(self.SUBMIT_CREATE)
        return self

    def create(self, name, description=""):
        self.open_create()
        self.fill_and_submit(name, description)
        self.wait_visible(self.card_by_name(name))
        return self

    def submit_empty_expect_error(self):
        self.click(self.SUBMIT_CREATE)
        self.wait_visible(self.NAME_ERROR)
        return self

    def has_card(self, name, timeout=8):
        return self.is_present(self.card_by_name(name), timeout=timeout)

    def count_cards(self):
        return len(self.driver.find_elements(*self.CARD))

    def select_tab(self, label):
        self.click(self.tab(label))
        return self

    def open_detail(self, name):
        self.click(self.card_by_name(name))
        # el drawer muestra las métricas Pipelines/Modelos
        self.wait_visible((By.XPATH, "//*[normalize-space()='Pipelines']"))
        return self

    def edit_rename(self, old_name, new_name):
        """Renombra vía el drawer de detalle (botón 'Editar' siempre visible)."""
        self.open_detail(old_name)
        self.click(self.DRAWER_EDIT)
        self.wait_visible(self.NAME)
        self.type(self.NAME, new_name)
        self.click(self.SUBMIT_SAVE)
        # tras guardar, recargar para un estado limpio (sin overlay del drawer)
        self.load()
        self.wait_visible(self.card_by_name(new_name))
        return self

    def delete(self, name):
        """Elimina vía el drawer de detalle (botón 'Eliminar' + confirmación)."""
        self.open_detail(name)
        self.click(self.DRAWER_DELETE)
        self.click(self.CONFIRM_DELETE)
        # la tarjeta debe desaparecer del listado
        self.wait.until(lambda d: not d.find_elements(*self.card_by_name(name)))
        return self

    def delete_all_with_prefix(self, prefix):
        """Limpieza best-effort: borra toda tarjeta cuyo nombre empiece por 'prefix'."""
        self.load()
        while True:
            cards = self.driver.find_elements(
                By.XPATH,
                f"//*[@data-tour='workspace-item'][.//p[starts-with(normalize-space(),'{prefix}')]]",
            )
            if not cards:
                break
            name_el = cards[0].find_element(By.XPATH, ".//p[starts-with(normalize-space(),'" + prefix + "')]")
            name = name_el.text.strip()
            try:
                self.delete(name)
            except Exception:
                break
