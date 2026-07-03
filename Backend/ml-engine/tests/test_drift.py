"""
Tests de detección de deriva de datos (app.pipeline.drift).

Cubre la señal propia basada en PSI (Population Stability Index), que alimenta la UI
de Monitoreo y es independiente de la versión de Evidently:
  - Extracción de features compactas (8 por imagen) y forma del tensor resultante.
  - PSI: ~0 para distribuciones idénticas, alto ante un desplazamiento fuerte.
  - Veredicto agregado: "sin deriva" para datasets similares; "significant" ante cambio.
  - Persistencia de la huella de referencia (save/load round-trip).

Solo depende de numpy (Evidently es opcional/best-effort) → corre en el CI ligero.
"""
import numpy as np

from app.pipeline import drift


def _imgs(n, color, size=8):
    return np.full((n, size, size, 3), color, dtype=np.uint8)


# ── Extracción de features ──────────────────────────────────────────────────────
def test_extract_features_shape_and_brightness():
    feats = drift.extract_features(_imgs(5, 100))
    assert feats.shape == (5, len(drift.FEATURE_NAMES))
    assert feats.dtype == np.float32
    # uint8 100 → 100/255 en [0,1]; el brillo medio debe reflejarlo
    b = feats[:, drift.FEATURE_NAMES.index("brightness")]
    assert np.allclose(b, 100 / 255, atol=1e-3)


def test_extract_features_empty():
    assert drift.extract_features(np.empty((0, 8, 8, 3), np.uint8)).shape == (0, 8)


# ── PSI ─────────────────────────────────────────────────────────────────────────
def test_psi_identical_is_zero():
    a = np.random.default_rng(0).normal(0, 1, 2000)
    assert drift._psi(a, a.copy()) < 0.01


def test_psi_strong_shift_is_significant():
    rng = np.random.default_rng(0)
    ref = rng.normal(0, 1, 2000)
    cur = rng.normal(3, 1, 2000)
    assert drift._psi(ref, cur) > drift._PSI_SIGNIFICANT


def test_psi_constant_feature_is_zero():
    const = np.full(500, 0.5)
    assert drift._psi(const, const) == 0.0


# ── Veredicto agregado ──────────────────────────────────────────────────────────
def test_compute_drift_similar_no_drift():
    rng = np.random.default_rng(1)
    ref = drift.extract_features(rng.integers(90, 110, (200, 8, 8, 3)).astype(np.uint8))
    cur = drift.extract_features(rng.integers(90, 110, (200, 8, 8, 3)).astype(np.uint8))
    res = drift.compute_drift(ref, cur)
    assert res is not None
    assert res["drifted"] is False
    assert res["severity"] in ("none", "moderate")
    assert set(res["per_feature"]) == set(drift.FEATURE_NAMES)


def test_compute_drift_flags_strong_shift():
    rng = np.random.default_rng(2)
    ref = drift.extract_features(rng.integers(0, 60, (200, 8, 8, 3)).astype(np.uint8))    # oscuras
    cur = drift.extract_features(rng.integers(200, 256, (200, 8, 8, 3)).astype(np.uint8))  # claras
    res = drift.compute_drift(ref, cur)
    assert res["drifted"] is True
    assert res["severity"] == "significant"
    assert res["max_psi"] >= drift._PSI_SIGNIFICANT


def test_compute_drift_empty_returns_none():
    empty = np.empty((0, 8), np.float32)
    assert drift.compute_drift(empty, empty) is None


# ── Persistencia de la huella de referencia ─────────────────────────────────────
def test_reference_roundtrip(tmp_path):
    X = np.random.default_rng(3).integers(0, 256, (50, 8, 8, 3)).astype(np.uint8)
    path = tmp_path / "ref.json"
    drift.save_reference(X, str(path))
    loaded = drift.load_reference(str(path))
    assert loaded is not None
    assert loaded.shape[1] == len(drift.FEATURE_NAMES)


def test_load_reference_missing_is_none(tmp_path):
    assert drift.load_reference(str(tmp_path / "no_existe.json")) is None
