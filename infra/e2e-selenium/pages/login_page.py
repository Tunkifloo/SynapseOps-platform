# -*- coding: utf-8 -*-
"""Page Object de la pantalla de login (/login).

Selectores tomados del componente real Frontend/src/features/auth/components/LoginForm.tsx:
  - input usuario/correo:  id="credential"
  - input contraseña:      id="password"
  - botón enviar:          button[type="submit"]  (texto "Iniciar sesión")
  - alerta de error:       p[role="alert"]
  - encabezado:            "Bienvenido de nuevo"
"""
from selenium.webdriver.common.by import By

from pages.base_page import BasePage


class LoginPage(BasePage):
    CREDENTIAL = (By.ID, "credential")
    PASSWORD = (By.ID, "password")
    SUBMIT = (By.CSS_SELECTOR, "button[type='submit']")
    ERROR_ALERT = (By.CSS_SELECTOR, "p[role='alert']")
    INLINE_ERROR = (By.CSS_SELECTOR, "p.text-destructive-strong")
    HEADING = (By.XPATH, "//h2[contains(., 'Bienvenido de nuevo')]")

    def load(self):
        self.open("/login")
        self.wait_visible(self.HEADING)
        return self

    def login(self, user, password):
        self.type(self.CREDENTIAL, user)
        self.type(self.PASSWORD, password)
        self.click(self.SUBMIT)
        return self

    def submit_empty(self):
        """Enviar el formulario sin datos para disparar la validación en cliente."""
        self.click(self.SUBMIT)
        return self

    def error_text(self):
        return self.wait_visible(self.ERROR_ALERT).text

    def has_inline_errors(self):
        return self.is_present(self.INLINE_ERROR, timeout=5)
