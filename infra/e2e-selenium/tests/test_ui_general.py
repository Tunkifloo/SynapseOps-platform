# -*- coding: utf-8 -*-
"""E2E — Comportamientos transversales de la interfaz.

Tema claro/oscuro con persistencia, perfil del usuario, persistencia de sesión
al recargar y el conmutador de visibilidad de la contraseña en el login.
"""
import pytest

import config
from pages.login_page import LoginPage
from pages.app_shell import AppShell
from pages.profile_page import ProfilePage


def _login(driver):
    LoginPage(driver).load().login(config.ADMIN_USER, config.ADMIN_PASSWORD)
    return AppShell(driver).wait_loaded()


@pytest.mark.e2e
def test_21_alternar_tema_persiste(driver):
    """TC-E2E-21 — Alternar el tema cambia <html>.dark y persiste tras recargar."""
    shell = _login(driver)
    antes = shell.is_dark()
    shell.toggle_theme()
    shell.wait.until(lambda d: shell.is_dark() != antes)
    despues = shell.is_dark()
    assert despues != antes, "El tema no cambió al pulsar el conmutador"

    # persistencia: recargar y comprobar que se mantiene
    driver.refresh()
    shell.wait_loaded()
    assert shell.is_dark() == despues, "El tema no persistió tras recargar la página"
    guardado = driver.execute_script("return localStorage.getItem('synapseops:theme')")
    assert guardado == ("dark" if despues else "light")


@pytest.mark.e2e
def test_22_ver_perfil(driver):
    """TC-E2E-22 — 'Mi perfil' carga y muestra el correo del usuario."""
    _login(driver)
    profile = ProfilePage(driver).load()
    assert profile.is_present(ProfilePage.HEADING), "No cargó la pantalla de perfil"
    assert "@" in profile.email_value(), "El perfil no muestra un correo electrónico válido"


@pytest.mark.e2e
def test_23_sesion_persiste_al_recargar(driver):
    """TC-E2E-23 — Recargar una ruta protegida mantiene la sesión (no va a /login)."""
    shell = _login(driver)
    driver.get(f"{config.BASE_URL}/workspaces")
    shell.wait_url_contains("/workspaces")
    driver.refresh()
    shell.wait_loaded()
    assert "/login" not in driver.current_url, "La sesión no persistió: redirigió a /login"
    assert "/workspaces" in driver.current_url


@pytest.mark.e2e
def test_24_mostrar_ocultar_contrasena(driver):
    """TC-E2E-24 — El botón de visibilidad alterna el tipo del campo contraseña."""
    login = LoginPage(driver).load()
    campo = login.wait_visible(LoginPage.PASSWORD)
    login.type(LoginPage.PASSWORD, "secreto123")
    assert campo.get_attribute("type") == "password"

    from selenium.webdriver.common.by import By
    login.click((By.CSS_SELECTOR, "button[aria-label='Mostrar contraseña']"))
    assert campo.get_attribute("type") == "text", "La contraseña no se hizo visible"

    login.click((By.CSS_SELECTOR, "button[aria-label='Ocultar contraseña']"))
    assert campo.get_attribute("type") == "password", "La contraseña no volvió a ocultarse"
