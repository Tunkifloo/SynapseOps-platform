# -*- coding: utf-8 -*-
"""Fábrica del WebDriver.

Usa Selenium Manager (integrado en Selenium 4.6+): descarga y configura el driver
del navegador automáticamente en el primer uso, sin instalación manual de
chromedriver/msedgedriver. La primera ejecución requiere internet una sola vez;
luego el driver queda cacheado en el equipo.
"""
from selenium import webdriver
from selenium.webdriver.edge.options import Options as EdgeOptions
from selenium.webdriver.chrome.options import Options as ChromeOptions

import config


def _common_args(options):
    # Estabilidad en Windows/CI y tamaño de ventana determinista.
    options.add_argument("--window-size=1440,900")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--disable-gpu")
    options.add_argument("--lang=es")
    if config.HEADLESS:
        options.add_argument("--headless=new")
    return options


def build_driver():
    """Crea un WebDriver según config.BROWSER. Selenium Manager resuelve el driver."""
    if config.BROWSER == "chrome":
        options = _common_args(ChromeOptions())
        driver = webdriver.Chrome(options=options)
    else:  # edge (por defecto)
        options = _common_args(EdgeOptions())
        driver = webdriver.Edge(options=options)

    driver.set_page_load_timeout(config.PAGE_LOAD_TIMEOUT)
    return driver
