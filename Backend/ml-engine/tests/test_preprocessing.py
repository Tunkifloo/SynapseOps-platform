"""
Tests del preprocesamiento de imágenes (app.pipeline.preprocessing).

Cubre el patrón Strategy: normalización Min-Max [0,1], redimensionado y la factory.
Solo depende de numpy + PIL → corre en el CI ligero.
"""
import numpy as np
import pytest

from app.pipeline.preprocessing import (
    ImageResizeStrategy,
    NormalizationStrategy,
    build_preprocessing_strategy,
)


def test_normalization_scales_to_unit_range():
    X = np.array([0, 128, 255], dtype=np.float32)
    out = NormalizationStrategy().apply(X)
    assert out.min() == 0.0 and out.max() == 1.0
    assert out.dtype == np.float32


def test_normalization_constant_returns_unchanged():
    X = np.full((4, 4), 7.0, dtype=np.float32)
    out = NormalizationStrategy().apply(X)
    assert np.array_equal(out, X)            # max-min == 0 → se devuelve tal cual


def test_resize_shape_and_range():
    X = np.random.default_rng(0).integers(0, 256, (20, 20, 3)).astype(np.uint8)
    out = ImageResizeStrategy(target_size=(8, 8)).apply(X)
    assert out.shape == (8, 8, 3)
    assert out.min() >= 0.0 and out.max() <= 1.0


def test_factory_returns_expected_strategies():
    assert isinstance(build_preprocessing_strategy("normalization"), NormalizationStrategy)
    assert isinstance(build_preprocessing_strategy("resize", (32, 32)), ImageResizeStrategy)


def test_factory_unknown_raises():
    with pytest.raises(ValueError, match="desconocida"):
        build_preprocessing_strategy("inexistente")
