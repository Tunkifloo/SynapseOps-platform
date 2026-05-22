import logging
import urllib.request
import zipfile
from pathlib import Path
from typing import Tuple

import numpy as np

from app.config import settings

log = logging.getLogger(__name__)

KERAS_DATASETS = ("mnist", "fashion_mnist", "cifar10", "cifar100")


def load_dataset(
    dataset_path: str,
    workspace_id: str,
    execution_id: str,
) -> Tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, Tuple, int]:

    if dataset_path.startswith("keras://"):
        return _load_keras_builtin(dataset_path.replace("keras://", ""))

    if dataset_path.startswith("http://") or dataset_path.startswith("https://"):
        local = _download_zip(dataset_path, workspace_id, execution_id)
        return _load_image_directory(local)

    local_path = Path(dataset_path)
    if not local_path.exists():
        raise FileNotFoundError(f"Dataset no encontrado: {dataset_path}")

    if local_path.suffix.lower() == ".zip":
        extracted = _extract_zip(local_path, workspace_id, execution_id)
        return _load_image_directory(extracted)

    if local_path.is_dir():
        return _load_image_directory(str(local_path))

    raise ValueError(f"Formato no soportado: {dataset_path}")


def _load_keras_builtin(name: str):
    """
    Carga datasets estándar SIN depender de TensorFlow.
    Descarga directamente el .npz desde la URL oficial de Keras.
    Compatible con PyTorch y TensorFlow.
    """
    urls = {
        "mnist": "https://storage.googleapis.com/tensorflow/tf-keras-datasets/mnist.npz",
        "fashion_mnist": "https://storage.googleapis.com/tensorflow/tf-keras-datasets/train-labels-idx1-ubyte.gz",
        "cifar10": "https://www.cs.toronto.edu/~kriz/cifar-10-python.tar.gz",
    }

    # Para simplificar la demo — solo MNIST via numpy directo
    if name == "mnist":
        return _load_mnist_numpy()
    elif name == "fashion_mnist":
        return _load_fashion_mnist_numpy()
    elif name in ("cifar10", "cifar100"):
        # Para cifar necesitamos TF o descarga manual — usar TF si está disponible
        return _load_via_tensorflow(name)
    else:
        raise ValueError(
            f"Dataset Keras '{name}' no soportado. "
            f"Disponibles: mnist, fashion_mnist, cifar10")


def _load_mnist_numpy():
    """Descarga y carga MNIST directamente como numpy — sin TensorFlow."""
    import os

    cache_dir = Path.home() / ".cache" / "synapseops" / "datasets"
    cache_dir.mkdir(parents=True, exist_ok=True)
    npz_path = cache_dir / "mnist.npz"

    if not npz_path.exists():
        url = "https://storage.googleapis.com/tensorflow/tf-keras-datasets/mnist.npz"
        log.info("Descargando MNIST desde: %s", url)
        urllib.request.urlretrieve(url, str(npz_path))
        log.info("MNIST descargado en: %s", npz_path)

    data = np.load(str(npz_path))
    X_train = data["x_train"].astype(np.float32) / 255.0
    y_train = data["y_train"].astype(np.int64)
    X_val   = data["x_test"].astype(np.float32)  / 255.0
    y_val   = data["y_test"].astype(np.int64)

    # (N, 28, 28) → (N, 28, 28, 1)
    X_train = X_train[..., np.newaxis]
    X_val   = X_val[..., np.newaxis]

    input_shape = X_train.shape[1:]   # (28, 28, 1)
    num_classes = int(y_train.max()) + 1

    log.info("MNIST cargado: train=%d val=%d shape=%s classes=%d",
             len(X_train), len(X_val), input_shape, num_classes)

    return X_train, y_train, X_val, y_val, input_shape, num_classes


def _load_fashion_mnist_numpy():
    """Carga Fashion-MNIST directamente como numpy."""
    import gzip

    base_url = "http://fashion-mnist.s3-website.eu-west-1.amazonaws.com/"
    files = {
        "train_images": "train-images-idx3-ubyte.gz",
        "train_labels": "train-labels-idx1-ubyte.gz",
        "test_images":  "t10k-images-idx3-ubyte.gz",
        "test_labels":  "t10k-labels-idx1-ubyte.gz",
    }

    cache_dir = Path.home() / ".cache" / "synapseops" / "datasets" / "fashion_mnist"
    cache_dir.mkdir(parents=True, exist_ok=True)

    def load_images(path):
        with gzip.open(path, "rb") as f:
            data = np.frombuffer(f.read(), np.uint8, offset=16)
        return data.reshape(-1, 28, 28)

    def load_labels(path):
        with gzip.open(path, "rb") as f:
            return np.frombuffer(f.read(), np.uint8, offset=8)

    for key, fname in files.items():
        fpath = cache_dir / fname
        if not fpath.exists():
            log.info("Descargando: %s", fname)
            urllib.request.urlretrieve(base_url + fname, str(fpath))

    X_train = load_images(cache_dir / files["train_images"]).astype(np.float32) / 255.0
    y_train = load_labels(cache_dir / files["train_labels"]).astype(np.int64)
    X_val   = load_images(cache_dir / files["test_images"]).astype(np.float32)  / 255.0
    y_val   = load_labels(cache_dir / files["test_labels"]).astype(np.int64)

    X_train = X_train[..., np.newaxis]
    X_val   = X_val[..., np.newaxis]

    input_shape = X_train.shape[1:]
    num_classes = 10

    log.info("Fashion-MNIST cargado: train=%d val=%d shape=%s",
             len(X_train), len(X_val), input_shape)

    return X_train, y_train, X_val, y_val, input_shape, num_classes


def _load_via_tensorflow(name: str):
    """Fallback para datasets que requieren TF (cifar10/100)."""
    try:
        import tensorflow as tf
        loaders = {
            "cifar10":  tf.keras.datasets.cifar10,
            "cifar100": tf.keras.datasets.cifar100,
        }
        (X_train, y_train), (X_val, y_val) = loaders[name].load_data()
        X_train = X_train.astype(np.float32) / 255.0
        X_val   = X_val.astype(np.float32)   / 255.0
        y_train = y_train.flatten().astype(np.int64)
        y_val   = y_val.flatten().astype(np.int64)
        input_shape = X_train.shape[1:]
        num_classes = 100 if name == "cifar100" else 10
        return X_train, y_train, X_val, y_val, input_shape, num_classes
    except ImportError:
        raise RuntimeError(
            f"Dataset '{name}' requiere TensorFlow instalado. "
            f"Usa 'mnist' o 'fashion_mnist' para entrenar sin TensorFlow.")


def _load_image_directory(dataset_dir: str):
    """Carga imágenes desde directorio — requiere TF para image_dataset_from_directory."""
    import tensorflow as tf

    img_size = (64, 64)
    log.info("Cargando imágenes desde: %s", dataset_dir)

    train_ds = tf.keras.utils.image_dataset_from_directory(
        dataset_dir, validation_split=0.2, subset="training",
        seed=42, image_size=img_size, batch_size=None, label_mode="int")
    val_ds = tf.keras.utils.image_dataset_from_directory(
        dataset_dir, validation_split=0.2, subset="validation",
        seed=42, image_size=img_size, batch_size=None, label_mode="int")

    X_train = np.stack([x.numpy() for x, _ in train_ds]).astype(np.float32) / 255.0
    y_train = np.array([y.numpy() for _, y in train_ds], dtype=np.int64)
    X_val   = np.stack([x.numpy() for x, _ in val_ds]).astype(np.float32)   / 255.0
    y_val   = np.array([y.numpy() for _, y in val_ds], dtype=np.int64)

    num_classes = len(train_ds.class_names)
    input_shape = X_train.shape[1:]

    log.info("Imágenes: train=%d val=%d clases=%s shape=%s",
             len(X_train), len(X_val), train_ds.class_names, input_shape)

    return X_train, y_train, X_val, y_val, input_shape, num_classes


def _download_zip(url: str, workspace_id: str, execution_id: str) -> str:
    dl_dir = Path(settings.storage_base_path) / workspace_id / "downloads"
    dl_dir.mkdir(parents=True, exist_ok=True)
    zip_path = dl_dir / f"dataset_{execution_id}.zip"
    log.info("Descargando: %s", url)
    urllib.request.urlretrieve(url, str(zip_path))
    return _extract_zip(zip_path, workspace_id, execution_id)


def _extract_zip(zip_path: Path, workspace_id: str, execution_id: str) -> str:
    extract_dir = (Path(settings.storage_base_path) /
                   workspace_id / "extracted" / execution_id)
    extract_dir.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(zip_path, "r") as zf:
        zf.extractall(extract_dir)
    subdirs = [d for d in extract_dir.iterdir() if d.is_dir()]
    root = subdirs[0] if len(subdirs) == 1 else extract_dir
    log.info("ZIP extraído: %s", root)
    return str(root)