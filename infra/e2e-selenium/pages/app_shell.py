# -*- coding: utf-8 -*-
"""Page Object del shell autenticado (barra lateral + cabecera).

Selectores tomados de Frontend/src/shared/layout/AppShell.tsx:
  - navegación principal: <nav aria-label="Navegación principal"> con botones cuyo
    texto es la etiqueta del módulo ("Resumen", "Espacios de trabajo", "Lienzo", ...).
  - botón de logout: Button con texto "Cerrar sesión" → abre ConfirmDialog
    (título "Cerrar sesión", confirmLabel "Cerrar sesión").
  - encabezado del Resumen: PageHeader con título "Resumen".
"""
from selenium.webdriver.common.by import By

from pages.base_page import BasePage


class AppShell(BasePage):
    NAV = (By.CSS_SELECTOR, "nav[aria-label='Navegación principal']")
    HEADING_RESUMEN = (By.XPATH, "//h1[normalize-space()='Resumen'] | //*[contains(@class,'font-heading') and normalize-space()='Resumen']")
    LOGOUT_BTN = (By.XPATH, "//button[normalize-space()='Cerrar sesión']")
    CONFIRM_LOGOUT = (By.XPATH, "//button[normalize-space()='Cerrar sesión' and ancestor::*[@role='dialog' or @role='alertdialog']]")
    SEARCH = (By.CSS_SELECTOR, "input[aria-label='Buscar acciones, espacios o usuarios']")
    THEME_TOGGLE = (By.CSS_SELECTOR, "button[aria-label^='Cambiar a tema']")

    def wait_loaded(self):
        """Espera a que el shell autenticado esté presente (barra de navegación)."""
        self.wait_visible(self.NAV)
        return self

    def nav_link(self, label):
        return (By.XPATH, f"//nav[@aria-label='Navegación principal']//button[normalize-space()='{label}']")

    def go_to(self, label):
        self.click(self.nav_link(label))
        return self

    def is_nav_present(self, timeout=5):
        return self.is_present(self.NAV, timeout=timeout)

    def logout(self):
        self.click(self.LOGOUT_BTN)
        # el ConfirmDialog muestra un segundo botón "Cerrar sesión" que confirma
        self.click(self.CONFIRM_LOGOUT)
        return self

    # ── búsqueda global (cabecera) ────────────────────────────────────────
    def search(self, text):
        box = self.wait_visible(self.SEARCH)
        box.clear()
        box.send_keys(text)
        return self

    def clear_search(self):
        box = self.wait_visible(self.SEARCH)
        box.clear()
        # Ctrl+A + Delete por si clear() no dispara el onChange de React
        from selenium.webdriver.common.keys import Keys
        box.send_keys(Keys.CONTROL, "a")
        box.send_keys(Keys.DELETE)
        return self

    # ── tema (claro/oscuro) ───────────────────────────────────────────────
    def is_dark(self):
        return self.driver.execute_script(
            "return document.documentElement.classList.contains('dark')"
        )

    def toggle_theme(self):
        self.click(self.THEME_TOGGLE)
        return self
