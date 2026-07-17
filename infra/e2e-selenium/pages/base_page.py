# -*- coding: utf-8 -*-
"""Page Object base: utilidades comunes de espera e interacción."""
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.common.keys import Keys

import config


class BasePage:
    def __init__(self, driver):
        self.driver = driver
        self.wait = WebDriverWait(driver, config.WAIT_TIMEOUT)

    # ── navegación ────────────────────────────────────────────────────────
    def open(self, path=""):
        self.driver.get(f"{config.BASE_URL}{path}")
        return self

    @property
    def current_path(self):
        url = self.driver.current_url
        # normaliza tanto BrowserRouter (/dashboard) como HashRouter (#/dashboard)
        return url.replace(config.BASE_URL, "").lstrip("#") or "/"

    # ── esperas ───────────────────────────────────────────────────────────
    def wait_visible(self, locator):
        return self.wait.until(EC.visibility_of_element_located(locator))

    def wait_clickable(self, locator):
        return self.wait.until(EC.element_to_be_clickable(locator))

    def wait_url_contains(self, fragment):
        return self.wait.until(EC.url_contains(fragment))

    def is_present(self, locator, timeout=3):
        try:
            WebDriverWait(self.driver, timeout).until(EC.presence_of_element_located(locator))
            return True
        except Exception:
            return False

    # ── interacción ──────────────────────────────────────────────────────
    def type(self, locator, text):
        """Escribe reemplazando el contenido previo.

        En inputs controlados por React, `clear()` no siempre sincroniza el estado;
        seleccionar todo (Ctrl+A) y sobrescribir es robusto tanto en campos vacíos
        como prellenados (p. ej. el formulario de edición).
        """
        el = self.wait_visible(locator)
        el.click()
        el.send_keys(Keys.CONTROL, "a")
        el.send_keys(Keys.DELETE)
        el.send_keys(text)
        return el

    def click(self, locator):
        self.wait_clickable(locator).click()

    def screenshot(self, path):
        self.driver.save_screenshot(path)
