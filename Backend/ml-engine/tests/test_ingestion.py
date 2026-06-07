"""
Tests de la ingesta de datasets (app.pipeline.training.ingestion).

Cubre:
  - Detección de estructura: splits explícitos train/val/test vs carpetas-clase planas.
  - Auto-split 80/20 para carpetas-clase planas.
  - Guardrails: <2 clases, exceso de imágenes (memoria).
  - Errores: ZIP corrupto, dataset built-in no soportado.

Solo depende de PIL + numpy (la ingesta no importa TensorFlow/PyTorch), por lo que
estos tests corren rápido y sin GPU.
"""
import zipfile

import pytest
from PIL import Image

from app.pipeline.training import ingestion
from app.pipeline.training.ingestion import DatasetBundle, load_dataset


def _make_image(path, color=(255, 0, 0)):
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.new("RGB", (12, 12), color).save(path)


def _make_class(dir_path, class_name, n):
    for i in range(n):
        _make_image(dir_path / class_name / f"img_{i}.png")


# ── Estructura: carpetas-clase planas + auto-split ──────────────────────────────
def test_flat_folders_autosplit(tmp_path):
    _make_class(tmp_path, "gato", 4)
    _make_class(tmp_path, "perro", 4)

    bundle = load_dataset(str(tmp_path), "1", "1")

    assert isinstance(bundle, DatasetBundle)
    assert bundle.num_classes == 2
    assert sorted(bundle.class_names) == ["gato", "perro"]
    assert len(bundle.X_train) > 0
    assert len(bundle.X_val) > 0
    assert bundle.X_test is None            # sin split de test en modo plano
    assert bundle.input_shape == (64, 64, 3)


# ── Estructura: splits explícitos train/validation/test ─────────────────────────
def test_explicit_train_val_test(tmp_path):
    for split in ("train", "validation", "test"):
        _make_class(tmp_path / split, "a", 2)
        _make_class(tmp_path / split, "b", 2)

    bundle = load_dataset(str(tmp_path), "1", "1")

    assert bundle.num_classes == 2
    assert bundle.X_test is not None        # el split test se carga
    assert len(bundle.X_test) == 4


def test_explicit_val_alias(tmp_path):
    # 'val' debe reconocerse como alias de 'validation'
    for split in ("train", "val"):
        _make_class(tmp_path / split, "a", 2)
        _make_class(tmp_path / split, "b", 2)

    bundle = load_dataset(str(tmp_path), "1", "1")
    assert bundle.num_classes == 2
    assert bundle.X_test is None


# ── Guardrails ──────────────────────────────────────────────────────────────────
def test_rejects_single_class(tmp_path):
    _make_class(tmp_path, "unica", 4)

    with pytest.raises(ValueError, match="al menos 2 clases"):
        load_dataset(str(tmp_path), "1", "1")


def test_caps_too_many_images(tmp_path, monkeypatch):
    # Fallback inteligente: si el dataset excede el tope, se submuestrea (no falla).
    monkeypatch.setattr(ingestion, "MAX_IMAGES", 4)
    _make_class(tmp_path, "a", 4)
    _make_class(tmp_path, "b", 4)   # total 8 > 4 → submuestreo a ≤4

    bundle = load_dataset(str(tmp_path), "1", "1")
    total = len(bundle.X_train) + len(bundle.X_val)
    assert total <= 4
    assert bundle.num_classes == 2


# ── Errores ─────────────────────────────────────────────────────────────────────
def test_bad_zip_raises_valueerror(tmp_path):
    fake_zip = tmp_path / "dataset.zip"
    fake_zip.write_text("esto no es un zip")

    with pytest.raises(ValueError, match="ZIP válido"):
        load_dataset(str(fake_zip), "1", "1")


def test_unsupported_keras_dataset(tmp_path):
    with pytest.raises(ValueError, match="no soportado"):
        load_dataset("keras://cifar10", "1", "1")


def test_missing_path_raises(tmp_path):
    with pytest.raises(FileNotFoundError):
        load_dataset(str(tmp_path / "no_existe.zip"), "1", "1")


def test_valid_zip_with_class_folders(tmp_path):
    # Construye un zip con estructura de carpetas-clase y verifica la ingesta E2E.
    src = tmp_path / "src"
    _make_class(src, "x", 3)
    _make_class(src, "y", 3)

    zip_path = tmp_path / "ds.zip"
    with zipfile.ZipFile(zip_path, "w") as zf:
        for f in src.rglob("*.png"):
            zf.write(f, f.relative_to(src))

    bundle = load_dataset(str(zip_path), "1", "exec1")
    assert bundle.num_classes == 2
