# -*- coding: utf-8 -*-
"""Page Object de "Mi perfil" (/profile).

Selectores tomados de ProfilePage.tsx: PageHeader "Mi perfil"; campos #name,
#paternalSurname; etiqueta "Correo electrónico".
"""
from selenium.webdriver.common.by import By

from pages.base_page import BasePage


class ProfilePage(BasePage):
    HEADING = (By.XPATH, "//*[normalize-space()='Mi perfil']")
    NAME = (By.ID, "name")
    EMAIL_INPUT = (By.XPATH, "//label[normalize-space()='Correo electrónico']/following-sibling::input")

    def load(self):
        self.open("/profile")
        self.wait_visible(self.HEADING)
        return self

    def email_value(self):
        """Devuelve el valor del campo (deshabilitado) de correo del usuario."""
        el = self.wait.until(lambda d: d.find_element(*self.EMAIL_INPUT))
        return el.get_attribute("value") or ""
