# -*- coding: utf-8 -*-
"""Page Object de "Gestión de usuarios" (/admin, solo ADMIN).

Selectores de AdminUsersPage.tsx / UsersTable.tsx: PageHeader "Gestión de usuarios";
CTA "Crear usuario"; DialogTitle "Crear usuario"; formulario con submit type=submit.
Las pruebas NO crean usuarios persistentes: validan la carga y la validación del
formulario, y cancelan sin enviar.
"""
from selenium.webdriver.common.by import By

from pages.base_page import BasePage


class AdminUsersPage(BasePage):
    HEADING = (By.XPATH, "//*[normalize-space()='Gestión de usuarios']")
    CREATE_CTA = (By.XPATH, "//button[normalize-space()='Crear usuario']")
    DIALOG_TITLE = (By.XPATH, "//*[normalize-space()='Crear usuario' and (self::h2 or @role='heading' or contains(@id,'title'))]")
    DIALOG = (By.CSS_SELECTOR, "[role='dialog']")
    DIALOG_SUBMIT = (By.CSS_SELECTOR, "[role='dialog'] form button[type='submit']")
    INLINE_ERROR = (By.CSS_SELECTOR, "[role='dialog'] p.text-destructive-strong")
    CANCEL = (By.XPATH, "//div[@role='dialog']//button[normalize-space()='Cancelar']")

    def load(self):
        self.open("/admin")
        self.wait_visible(self.HEADING)
        return self

    def open_create(self):
        self.click(self.CREATE_CTA)
        self.wait_visible(self.DIALOG)
        return self

    def submit_empty_expect_errors(self):
        self.click(self.DIALOG_SUBMIT)
        self.wait_visible(self.INLINE_ERROR)
        return self

    def cancel(self):
        self.click(self.CANCEL)
        return self
