# -*- coding: utf-8 -*-
"""E2E — Navegación y validación de las pantallas de autenticación (sin sesión).

Profundiza en el módulo de acceso: registro (Sign Up), recuperación de contraseña,
enlaces de navegación entre pantallas y la redirección de la raíz.
"""
import pytest

import config
from pages.login_page import LoginPage
from pages.signup_page import SignUpPage


@pytest.mark.e2e
def test_25_login_a_registro(driver):
    """TC-E2E-25 — Desde el login, el enlace 'Regístrate' abre el registro."""
    login = LoginPage(driver).load()
    login.click(LoginPage.SIGNUP_LINK)
    login.wait_url_contains("/signup")
    SignUpPage(driver).loaded()
    assert "/signup" in driver.current_url


@pytest.mark.e2e
def test_26_registro_valida_campos(driver):
    """TC-E2E-26 — El formulario de registro valida los campos obligatorios."""
    driver.get(f"{config.BASE_URL}/signup")
    signup = SignUpPage(driver).loaded()
    signup.submit_empty_expect_errors()
    assert signup.has_inline_errors(), "El registro no mostró errores de validación"
    # volver al login por el enlace 'Inicia sesión'
    signup.click(SignUpPage.LOGIN_LINK)
    signup.wait_url_contains("/login")
    assert "/login" in driver.current_url


@pytest.mark.e2e
def test_27_login_a_recuperar_contrasena(driver):
    """TC-E2E-27 — Desde el login, '¿Olvidaste tu contraseña?' abre la recuperación."""
    login = LoginPage(driver).load()
    login.click(LoginPage.FORGOT_LINK)
    login.wait_url_contains("/forgot-password")
    assert "/forgot-password" in driver.current_url


@pytest.mark.e2e
def test_28_raiz_redirige_a_login(driver):
    """TC-E2E-28 — La raíz '/' sin sesión redirige a /login."""
    driver.get(f"{config.BASE_URL}/")
    LoginPage(driver).wait_url_contains("/login")
    assert "/login" in driver.current_url
