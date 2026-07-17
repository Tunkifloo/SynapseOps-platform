# -*- coding: utf-8 -*-
"""Fixtures compartidas de la suite E2E.

Provee un WebDriver por test y captura automáticamente una screenshot de
evidencia cuando un test falla (útil para adjuntar en Notion).
"""
import os
import pytest

import config
from driver_factory import build_driver


@pytest.fixture()
def driver(request):
    drv = build_driver()
    try:
        yield drv
    finally:
        # captura de evidencia si el test falló
        rep = getattr(request.node, "rep_call", None)
        if rep is not None and rep.failed:
            os.makedirs(config.ARTIFACTS_DIR, exist_ok=True)
            safe = request.node.name.replace("/", "_").replace("::", "_")
            path = os.path.join(config.ARTIFACTS_DIR, f"FAIL_{safe}.png")
            try:
                drv.save_screenshot(path)
                print(f"\n[evidencia] captura de fallo guardada en: {path}")
            except Exception:
                pass
        drv.quit()


@pytest.hookimpl(hookwrapper=True)
def pytest_runtest_makereport(item, call):
    """Expone el resultado de cada fase (setup/call/teardown) a las fixtures."""
    outcome = yield
    rep = outcome.get_result()
    setattr(item, f"rep_{rep.when}", rep)
