# -*- coding: utf-8 -*-
"""Page Object de la pantalla de registro (/signup).

Selectores tomados de SignUpPage.tsx: campos con id 'su-*'; enlace de vuelta
"Inicia sesión"; botón de envío type=submit.
"""
from selenium.webdriver.common.by import By

from pages.base_page import BasePage


class SignUpPage(BasePage):
    NAME = (By.ID, "su-name")
    PAT = (By.ID, "su-pat")
    USER = (By.ID, "su-user")
    CODE = (By.ID, "su-code")
    EMAIL = (By.ID, "su-email")
    PASS = (By.ID, "su-pass")
    SUBMIT = (By.CSS_SELECTOR, "form button[type='submit']")
    INLINE_ERROR = (By.CSS_SELECTOR, "p.text-destructive-strong")
    LOGIN_LINK = (By.XPATH, "//a[normalize-space()='Inicia sesión']")

    def loaded(self):
        self.wait_visible(self.NAME)
        return self

    def submit_empty_expect_errors(self):
        self.click(self.SUBMIT)
        self.wait_visible(self.INLINE_ERROR)
        return self

    def has_inline_errors(self, timeout=5):
        return self.is_present(self.INLINE_ERROR, timeout=timeout)
