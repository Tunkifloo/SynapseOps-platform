"""
Ingesta de datasets para el pipeline MLOps.

Soporta:
  - Datasets built-in vía `keras://<nombre>` (solo mnist, fashion_mnist — sin TF).
  - Datasets propios de imágenes (zip subido o descargado de URL), con dos layouts
    autodetectados:
      1) Splits explícitos:  train/<clase>/*  +  (val|validation)/<clase>/*  [+ test/<clase>/*]
      2) Carpetas-clase planas: <clase>/*  → auto-split 80/20 (train/val), sin test.

Las imágenes se cargan con PIL (no requiere TensorFlow), se redimensionan a un
tamaño fijo y se normalizan a [0,1]. Guardrails de memoria para el contenedor de 8GB.
"""
import logging
import re
import urllib.error
import urllib.request
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np
from PIL import Image, UnidentifiedImageError

from app.config import settings

log = logging.getLogger(__name__)

# Datasets built-in soportados sin TensorFlow (cargados como numpy).
KERAS_DATASETS = ("mnist", "fashion_mnist")

# ── Guardrails para el contenedor de 8GB ───────────────────────────────────────
IMG_SIZE: Tuple[int, int] = (64, 64)   # tamaño fijo de entrada para datasets propios
MAX_IMAGES = 50_000                    # tope de imágenes a materializar en memoria
MIN_IMAGES = 20                         # mínimo por clase para entrenar (evita overfitting)
MAX_CLASSES = 50                        # tope de clases
_HOLDOUT_FRACTION = 0.15               # test ciego a reservar cuando no hay split 'test'
IMAGE_EXTS = (".png", ".jpg", ".jpeg", ".bmp")

# Palabras clave de cada split. La detección NO es por igualdad exacta: clasifica por el
# PRIMER token del nombre (separadores _ - / espacio / camelCase), así reconoce variantes
# como "Train_Set_Folder", "validation set", "test-data", "trainSet" SIN confundir clases
# reales de un solo token (p. ej. "testtubes", "training_shoes" → se evita pidiendo ≥2 splits).
_SPLIT_KEYWORDS: Dict[str, Tuple[str, ...]] = {
    "train": ("train", "training", "trainset", "traindata"),
    "val":   ("val", "valid", "validation", "valset", "valdata"),
    "test":  ("test", "testing", "testset", "testdata"),
}


def _classify_split(name: str) -> Optional[str]:
    """Devuelve 'train'/'val'/'test' si el nombre de carpeta corresponde a un split, o None.

    Tokeniza por separadores y camelCase y mira el PRIMER token: 'Train_Set_Folder' → token
    'train' → train; 'ValidationSetFolder' → 'validation' → val. Un nombre de UN solo token
    que no sea exactamente un keyword (p. ej. 'testtubes') NO se clasifica como split."""
    # camelCase → espacios, luego separadores comunes a tokens en minúscula.
    spaced = re.sub(r"(?<=[a-z])(?=[A-Z])", " ", name.strip())
    tokens = [t for t in re.split(r"[\s_\-./]+", spaced.lower()) if t]
    if not tokens:
        return None
    first = tokens[0]
    for split, kws in _SPLIT_KEYWORDS.items():
        if first in kws:
            return split
    return None


@dataclass
class DatasetBundle:
    """Dataset listo para entrenar. `X_test`/`y_test` son opcionales."""
    X_train: np.ndarray
    y_train: np.ndarray
    X_val: np.ndarray
    y_val: np.ndarray
    input_shape: Tuple
    num_classes: int
    class_names: List[str]
    X_test: Optional[np.ndarray] = None
    y_test: Optional[np.ndarray] = None


# ── Punto de entrada ────────────────────────────────────────────────────────────
def load_dataset(
    dataset_path: str,
    workspace_id: str,
    execution_id: str,
    image_size: Optional[int] = None,
    train_ratio: Optional[int] = None,
    normalization: Optional[str] = None,
    max_images: Optional[int] = None,
) -> DatasetBundle:
    """
    image_size    → tamaño de entrada (px) para datasets propios (nodo Preprocesamiento).
    train_ratio   → % de entrenamiento (50–90) para datasets sin splits explícitos (nodo Split).
    normalization → minmax [0,1] (default) | zscore (media/σ del train) | rescale [-1,1].
    max_images    → tope de imágenes a materializar (default MAX_IMAGES). Transfer Learning
                    pasa un tope menor porque 224px consume ~12x más memoria que 64px.
    Los datasets built-in (keras://) usan su forma y split predefinidos.
    """
    if not dataset_path or not dataset_path.strip():
        raise ValueError("El workspace no tiene un dataset asignado.")

    size = _resolve_image_size(image_size)
    ratio = _resolve_train_ratio(train_ratio)
    cap = int(max_images) if max_images else MAX_IMAGES

    if dataset_path.startswith("keras://"):
        bundle = _load_keras_builtin(dataset_path.replace("keras://", "").strip().lower())
    elif dataset_path.startswith("http://") or dataset_path.startswith("https://"):
        extracted = _download_archive(dataset_path, workspace_id, execution_id)
        bundle = _load_image_dataset(Path(extracted), size, ratio, cap)
    else:
        local_path = Path(dataset_path)
        if not local_path.exists():
            raise FileNotFoundError(f"Dataset no encontrado: {dataset_path}")
        if local_path.suffix.lower() == ".zip":
            extracted = _extract_zip(local_path, workspace_id, execution_id)
            bundle = _load_image_dataset(Path(extracted), size, ratio, cap)
        elif local_path.is_dir():
            bundle = _load_image_dataset(local_path, size, ratio, cap)
        else:
            raise ValueError(
                f"Formato de dataset no soportado: {dataset_path}. "
                f"Usa keras://mnist, una URL/.zip de imágenes, o un directorio.")

    return _apply_normalization(bundle, (normalization or "minmax").lower())


def _apply_normalization(bundle: DatasetBundle, strategy: str) -> DatasetBundle:
    """minmax (default): NO se materializa float; el dataset queda uint8 (o float[0,1] en
    builtins) y las estrategias castean /255 por lote → 4× menos RAM. zscore/rescale: sí
    requieren float, así que se convierte a [0,1] y se aplica la variante (caso menos común)."""
    if strategy == "minmax":
        return bundle
    # Convierte a [0,1] respetando el dtype: uint8 → /255; float (builtins) → tal cual.
    def to01(a):
        if a is None or not a.size:
            return a
        return (a.astype(np.float32) / 255.0) if a.dtype == np.uint8 else a.astype(np.float32)
    if strategy == "rescale":
        fn = lambda a: (to01(a) * 2.0 - 1.0).astype(np.float32) if a is not None and a.size else a
    elif strategy == "zscore":
        t = to01(bundle.X_train)
        mean = float(t.mean()) if t is not None and t.size else 0.0
        std = (float(t.std()) if t is not None and t.size else 1.0) or 1.0
        fn = lambda a: ((to01(a) - mean) / std).astype(np.float32) if a is not None and a.size else a
    else:
        log.warning("Normalización '%s' no reconocida; se usa minmax.", strategy)
        return bundle
    log.info("Normalización aplicada: %s", strategy)
    bundle.X_train = fn(bundle.X_train)
    bundle.X_val = fn(bundle.X_val)
    if bundle.X_test is not None:
        bundle.X_test = fn(bundle.X_test)
    return bundle


def _resolve_image_size(image_size: Optional[int]) -> Tuple[int, int]:
    if image_size and 16 <= int(image_size) <= 512:
        return (int(image_size), int(image_size))
    return IMG_SIZE


def _resolve_train_ratio(train_ratio: Optional[int]) -> float:
    if train_ratio and 50 <= int(train_ratio) <= 90:
        return int(train_ratio) / 100.0
    return 0.8


# ── Datasets built-in (numpy, sin TensorFlow) ───────────────────────────────────
def _load_keras_builtin(name: str) -> DatasetBundle:
    if name == "mnist":
        return _load_mnist_numpy()
    if name == "fashion_mnist":
        return _load_fashion_mnist_numpy()
    raise ValueError(
        f"Dataset built-in '{name}' no soportado. Disponibles: {', '.join(KERAS_DATASETS)}.")


def _load_mnist_numpy() -> DatasetBundle:
    cache_dir = Path.home() / ".cache" / "synapseops" / "datasets"
    cache_dir.mkdir(parents=True, exist_ok=True)
    npz_path = cache_dir / "mnist.npz"

    if not npz_path.exists():
        url = "https://storage.googleapis.com/tensorflow/tf-keras-datasets/mnist.npz"
        log.info("Descargando MNIST desde: %s", url)
        urllib.request.urlretrieve(url, str(npz_path))

    data = np.load(str(npz_path))
    X_train = (data["x_train"].astype(np.float32) / 255.0)[..., np.newaxis]
    y_train = data["y_train"].astype(np.int64)
    X_val   = (data["x_test"].astype(np.float32) / 255.0)[..., np.newaxis]
    y_val   = data["y_test"].astype(np.int64)

    input_shape = X_train.shape[1:]            # (28, 28, 1)
    num_classes = int(y_train.max()) + 1
    log.info("MNIST cargado: train=%d val=%d shape=%s classes=%d",
             len(X_train), len(X_val), input_shape, num_classes)
    return DatasetBundle(
        X_train, y_train, X_val, y_val, input_shape, num_classes,
        class_names=[str(i) for i in range(num_classes)])


def _load_fashion_mnist_numpy() -> DatasetBundle:
    import gzip

    # Mirrors en orden de preferencia. El primero es el mismo host fiable (HTTPS)
    # que usa MNIST y Keras; el S3 público queda como respaldo. El endpoint S3
    # original sobre HTTP era inestable y rompía la carga con cualquier framework.
    mirrors = (
        "https://storage.googleapis.com/tensorflow/tf-keras-datasets/",
        "http://fashion-mnist.s3-website.eu-west-1.amazonaws.com/",
    )
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
            return np.frombuffer(f.read(), np.uint8, offset=16).reshape(-1, 28, 28)

    def load_labels(path):
        with gzip.open(path, "rb") as f:
            return np.frombuffer(f.read(), np.uint8, offset=8)

    def _download_with_fallback(fname: str, dest: Path) -> None:
        last_error: Optional[Exception] = None
        for base in mirrors:
            try:
                log.info("Descargando Fashion-MNIST: %s desde %s", fname, base)
                urllib.request.urlretrieve(base + fname, str(dest))
                return
            except Exception as e:  # noqa: BLE001 — probamos el siguiente mirror
                last_error = e
                log.warning("Mirror falló (%s): %s", base, e)
        raise RuntimeError(
            f"No se pudo descargar Fashion-MNIST '{fname}' desde ningún mirror. "
            f"Último error: {last_error}")

    for fname in files.values():
        fpath = cache_dir / fname
        if not fpath.exists():
            _download_with_fallback(fname, fpath)

    X_train = (load_images(cache_dir / files["train_images"]).astype(np.float32) / 255.0)[..., np.newaxis]
    y_train = load_labels(cache_dir / files["train_labels"]).astype(np.int64)
    X_val   = (load_images(cache_dir / files["test_images"]).astype(np.float32) / 255.0)[..., np.newaxis]
    y_val   = load_labels(cache_dir / files["test_labels"]).astype(np.int64)

    input_shape = X_train.shape[1:]
    log.info("Fashion-MNIST cargado: train=%d val=%d shape=%s", len(X_train), len(X_val), input_shape)
    return DatasetBundle(
        X_train, y_train, X_val, y_val, input_shape, 10,
        class_names=[str(i) for i in range(10)])


# ── Datasets propios de imágenes (PIL, sin TensorFlow) ──────────────────────────
def _load_image_dataset(root: Path, size: Tuple[int, int], ratio: float,
                        cap: int = MAX_IMAGES) -> DatasetBundle:
    root = _normalize_root(root)

    train_dir = _resolve_split_dir(root, "train")
    val_dir   = _resolve_split_dir(root, "val")
    test_dir  = _resolve_split_dir(root, "test")

    if train_dir and val_dir:
        log.info("Layout detectado: splits explícitos en %s (tamaño=%s)", root, size)
        return _load_explicit_splits(train_dir, val_dir, test_dir, size, cap)

    # Solo 'train' (sin val): NO es una clase llamada "train" — se trata su contenido
    # como carpetas-clase planas y se auto-divide en 3 vías.
    if train_dir and not val_dir:
        log.info("Layout detectado: solo split 'train' → auto-split 3-vías sobre sus clases.")
        return _load_flat_with_autosplit(train_dir, size, ratio, cap)

    log.info("Layout detectado: carpetas-clase planas en %s (auto-split %d/%d, tamaño=%s)",
             root, int(ratio * 100), int((1 - ratio) * 100), size)
    return _load_flat_with_autosplit(root, size, ratio, cap)


def _load_explicit_splits(train_dir: Path, val_dir: Path,
                          test_dir: Optional[Path], size: Tuple[int, int],
                          cap: int = MAX_IMAGES) -> DatasetBundle:
    train_g = _gather_class_files(train_dir)
    val_g   = _gather_class_files(val_dir)
    test_g  = _gather_class_files(test_dir) if test_dir else {}

    # Métricas honestas: si el dataset NO trae split de test, se separa uno del train
    # (estratificado, semilla fija) para reportar sobre datos verdaderamente no vistos.
    if not test_g:
        train_g, test_g = _carve_holdout(train_g, _HOLDOUT_FRACTION)
        log.info("Sin split 'test' explícito → se reserva %.0f%% del train como test ciego.",
                 _HOLDOUT_FRACTION * 100)

    # Mapeo de clases consistente entre splits (unión ordenada).
    class_names = sorted(set(train_g) | set(val_g) | set(test_g))
    _validate_classes(class_names)
    class_to_idx = {c: i for i, c in enumerate(class_names)}

    total = _count(train_g) + _count(val_g) + _count(test_g)
    _validate_count(total)
    # Fallback: si excede el tope de memoria, recorta cada split proporcionalmente.
    if total > cap:
        factor = cap / total
        train_g = _cap_to_limit(train_g, max(1, int(_count(train_g) * factor)))
        val_g = _cap_to_limit(val_g, max(1, int(_count(val_g) * factor)))
        if test_g:
            test_g = _cap_to_limit(test_g, max(1, int(_count(test_g) * factor)))

    X_train, y_train = _materialize(train_g, class_to_idx, size)
    X_val,   y_val   = _materialize(val_g, class_to_idx, size)
    if X_train.size == 0 or X_val.size == 0:
        raise ValueError("Los splits 'train' y 'validation' no pueden estar vacíos.")

    X_test = y_test = None
    if test_g:
        X_test, y_test = _materialize(test_g, class_to_idx, size)
        if X_test.size == 0:
            X_test = y_test = None

    input_shape = X_train.shape[1:]
    log.info("Splits explícitos: train=%d val=%d test=%s clases=%d",
             len(X_train), len(X_val),
             0 if X_test is None else len(X_test), len(class_names))
    return DatasetBundle(X_train, y_train, X_val, y_val, input_shape,
                         len(class_names), class_names, X_test, y_test)


def _load_flat_with_autosplit(root: Path, size: Tuple[int, int], ratio: float,
                              cap: int = MAX_IMAGES) -> DatasetBundle:
    gathered = _gather_class_files(root)
    class_names = sorted(gathered)
    _validate_classes(class_names)
    _validate_count(_count(gathered))
    gathered = _cap_to_limit(gathered, cap)   # fallback: recorta al tope de memoria
    class_to_idx = {c: i for i, c in enumerate(class_names)}

    # Split 3-vías estratificado por clase (semilla fija → determinista).
    # `ratio` = fracción de train; el resto se reparte mitad val / mitad test ciego.
    rng = np.random.default_rng(42)
    train_g: Dict[str, List[Path]] = {}
    val_g:   Dict[str, List[Path]] = {}
    test_g:  Dict[str, List[Path]] = {}
    for cname, files in gathered.items():
        files = list(files)
        rng.shuffle(files)
        n = len(files)
        if n < 2:
            raise ValueError(
                f"La clase '{cname}' tiene {n} imagen(es); se requieren ≥2 "
                f"para dividir en train/validación.")
        k_train = max(1, min(int(n * ratio), n - 1))   # deja ≥1 para evaluación
        rest = files[k_train:]
        train_g[cname] = files[:k_train]
        if len(rest) >= 2:
            # val recibe la mitad mayor; test la menor (held-out real).
            n_test = len(rest) // 2
            val_g[cname]  = rest[:len(rest) - n_test]
            test_g[cname] = rest[len(rest) - n_test:]
        else:
            val_g[cname] = rest            # clase muy pequeña: sin test propio
            test_g[cname] = []

    X_train, y_train = _materialize(train_g, class_to_idx, size)
    X_val,   y_val   = _materialize(val_g, class_to_idx, size)
    X_test = y_test = None
    if any(test_g.values()):
        X_test, y_test = _materialize(test_g, class_to_idx, size)
        if X_test.size == 0:
            X_test = y_test = None

    input_shape = X_train.shape[1:]
    log.info("Auto-split 3-vías: train=%d val=%d test=%s clases=%d",
             len(X_train), len(X_val),
             0 if X_test is None else len(X_test), len(class_names))
    return DatasetBundle(X_train, y_train, X_val, y_val, input_shape,
                         len(class_names), class_names, X_test, y_test)


# ── Helpers de carga ────────────────────────────────────────────────────────────
def _normalize_root(root: Path) -> Path:
    """Si todo viene envuelto en carpetas (típico al extraer un zip), desciende
    hasta la raíz real del dataset. Ignora archivos no-imagen sueltos (licencias,
    README, .txt/.pdf/.docx) que suelen acompañar a datasets públicos — p. ej. la
    zip de cats/dogs trae PetImages/{Cat,Dog} + documentos de licencia en la raíz."""
    for _ in range(4):  # hasta 4 niveles de envoltura
        entries = [e for e in root.iterdir() if not e.name.startswith(("__MACOSX", "."))]
        subdirs = [e for e in entries if e.is_dir()]
        image_files = [e for e in entries
                       if e.is_file() and e.suffix.lower() in IMAGE_EXTS]
        # Desciende si hay UNA carpeta y ninguna imagen suelta en este nivel.
        if len(subdirs) == 1 and not image_files:
            root = subdirs[0]
            continue
        # Varias carpetas sin imágenes sueltas: si SOLO UNA parece dataset (splits o
        # clases con imágenes), desciende a ella e ignora docs/anotaciones/metadata.
        if len(subdirs) > 1 and not image_files:
            dataset_like = [d for d in subdirs if _looks_like_dataset(d)]
            if len(dataset_like) == 1:
                root = dataset_like[0]
                continue
        break
    return root


def _looks_like_dataset(d: Path) -> bool:
    """¿`d` es un split (train/val/test) o tiene clases (subcarpetas con imágenes)?"""
    child_dirs = [c for c in d.iterdir() if c.is_dir()
                  and not c.name.startswith(("__MACOSX", "."))]
    if any(_classify_split(c.name) is not None for c in child_dirs):
        return True
    # Basta una imagen dentro de alguna subcarpeta-clase para considerarlo dataset.
    for c in child_dirs:
        for f in c.rglob("*"):
            if f.is_file() and f.suffix.lower() in IMAGE_EXTS:
                return True
    return False


def _resolve_split_dir(root: Path, split: str) -> Optional[Path]:
    """Carpeta del split pedido detectada por nombre (tolerante: 'Train_Set_Folder', etc.).
    Solo cuenta si además CONTIENE subcarpetas (las clases) → evita tomar un archivo o una
    carpeta-clase suelta llamada como un split."""
    for child in sorted(root.iterdir()):
        if not child.is_dir() or child.name.startswith(("__MACOSX", ".")):
            continue
        if _classify_split(child.name) == split and _has_subdirs(child):
            return child
    return None


def _has_subdirs(d: Path) -> bool:
    return any(c.is_dir() and not c.name.startswith(("__MACOSX", ".")) for c in d.iterdir())


def _gather_class_files(split_dir: Path) -> Dict[str, List[Path]]:
    result: Dict[str, List[Path]] = {}
    for class_dir in sorted(p for p in split_dir.iterdir() if p.is_dir()):
        imgs = [f for f in class_dir.rglob("*")
                if f.is_file() and f.suffix.lower() in IMAGE_EXTS]
        if imgs:
            result[class_dir.name] = imgs
    return result


def _materialize(gathered: Dict[str, List[Path]],
                 class_to_idx: Dict[str, int],
                 size: Tuple[int, int]) -> Tuple[np.ndarray, np.ndarray]:
    # Memoria: se PREASIGNA el array final y se llena in-place. Antes se construía una
    # lista de imágenes + np.asarray(), que DUPLICA el dataset en RAM (pico ~2×). Con
    # preasignación el pico baja a ~1× → clave para datasets a 224px (Transfer Learning).
    total = _count(gathered)
    h, w = size
    if total == 0:
        return np.empty((0,)), np.empty((0,), dtype=np.int64)
    X = np.empty((total, h, w, 3), dtype=np.uint8)   # 4× menos RAM que float32
    y = np.empty((total,), dtype=np.int64)
    n = 0
    for cname, files in gathered.items():
        idx = class_to_idx[cname]
        for f in files:
            try:
                X[n] = _load_image_file(f, size)
                y[n] = idx
                n += 1
            except (UnidentifiedImageError, OSError) as e:
                log.warning("Imagen ilegible, se omite: %s (%s)", f, e)
    if n == 0:
        return np.empty((0,)), np.empty((0,), dtype=np.int64)
    # Vistas (no copias) → no re-duplica memoria si hubo imágenes ilegibles.
    return X[:n], y[:n]


def _load_image_file(path: Path, size: Tuple[int, int]) -> np.ndarray:
    with Image.open(path) as img:
        img = img.convert("RGB").resize(size, Image.BILINEAR)
        # Se guarda uint8 (0-255), NO float32/255: 4× menos RAM. Las estrategias
        # castean a float [0,1] por lote en el entrenamiento.
        return np.asarray(img, dtype=np.uint8)


def _count(gathered: Dict[str, List[Path]]) -> int:
    return sum(len(v) for v in gathered.values())


def _validate_classes(class_names: List[str]) -> None:
    if len(class_names) < 2:
        raise ValueError(
            f"El dataset debe tener al menos 2 clases (carpetas); se encontraron "
            f"{len(class_names)}.")
    if len(class_names) > MAX_CLASSES:
        raise ValueError(
            f"El dataset tiene {len(class_names)} clases; el máximo permitido es {MAX_CLASSES}.")


def _validate_count(total: int) -> None:
    if total < MIN_IMAGES:
        raise ValueError(
            f"El dataset tiene {total} imágenes; se requieren al menos {MIN_IMAGES}.")


def _carve_holdout(gathered: Dict[str, List[Path]],
                   fraction: float) -> Tuple[Dict[str, List[Path]], Dict[str, List[Path]]]:
    """Separa una fracción estratificada por clase como held-out (test ciego).
    Determinista (semilla fija). Deja ≥1 imagen por clase en el train de origen."""
    rng = np.random.default_rng(42)
    kept: Dict[str, List[Path]] = {}
    holdout: Dict[str, List[Path]] = {}
    for cname, files in gathered.items():
        files = list(files)
        rng.shuffle(files)
        n = len(files)
        n_hold = min(max(0, int(round(n * fraction))), n - 1)  # nunca vacía el train
        holdout[cname] = files[:n_hold]
        kept[cname] = files[n_hold:]
    return kept, holdout


def _cap_to_limit(gathered: Dict[str, List[Path]], limit: int) -> Dict[str, List[Path]]:
    """Fallback inteligente: si el total supera el tope de memoria (`limit`),
    submuestrea cada clase de forma proporcional (estratificada) para ajustarse
    al máximo permitido, en lugar de fallar. Determinista (semilla fija)."""
    total = _count(gathered)
    if total <= limit:
        return gathered
    rng = np.random.default_rng(42)
    capped: Dict[str, List[Path]] = {}
    for cname, files in gathered.items():
        keep = max(1, int(len(files) * limit / total))
        sample = list(files)
        rng.shuffle(sample)
        capped[cname] = sample[:keep]
    kept = _count(capped)
    log.warning(
        "Dataset excede el tope de memoria (%d imágenes > %d): se aplica submuestreo "
        "estratificado por clase → %d imágenes.", total, limit, kept)
    return capped


# ── Descarga / extracción (blindado — item 5) ────────────────────────────────────
MAX_DOWNLOAD_BYTES = 1_500_000_000  # 1.5 GB tope de descarga


def _download_archive(url: str, workspace_id: str, execution_id: str) -> str:
    """
    Descarga un archivo .zip de imágenes desde una URL. Blindado:
    - Sigue redirecciones y valida el tipo de contenido.
    - Detecta páginas HTML (p. ej. la página de Kaggle que requiere login) y da
      un mensaje claro en lugar de fallar de forma opaca.
    - Aplica un tope de tamaño para proteger el entorno de 8 GB.
    """
    dl_dir = Path(settings.storage_base_path) / workspace_id / "downloads"
    dl_dir.mkdir(parents=True, exist_ok=True)
    zip_path = dl_dir / f"dataset_{execution_id}.zip"

    if "kaggle.com/datasets" in url and "/download" not in url:
        raise ValueError(
            "La URL parece la página de un dataset de Kaggle (requiere login). "
            "Usa el enlace directo de descarga (.zip) o sube el .zip manualmente.")

    req = urllib.request.Request(url, headers={"User-Agent": "SynapseOps/1.0"})
    log.info("Descargando dataset: %s", url)
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:  # noqa: S310
            ctype = (resp.headers.get("Content-Type") or "").lower()
            clen = int(resp.headers.get("Content-Length") or 0)
            if clen and clen > MAX_DOWNLOAD_BYTES:
                raise ValueError(
                    f"El archivo ({clen // 1_000_000} MB) supera el límite de "
                    f"{MAX_DOWNLOAD_BYTES // 1_000_000} MB.")
            if "text/html" in ctype:
                raise ValueError(
                    "La URL devolvió una página web (HTML), no un archivo. Verifica que "
                    "sea un enlace directo a un .zip público (sin login).")
            downloaded = 0
            with open(zip_path, "wb") as out:
                while True:
                    chunk = resp.read(1 << 20)
                    if not chunk:
                        break
                    downloaded += len(chunk)
                    if downloaded > MAX_DOWNLOAD_BYTES:
                        raise ValueError("La descarga supera el límite de tamaño permitido.")
                    out.write(chunk)
    except urllib.error.HTTPError as e:
        raise ValueError(f"No se pudo descargar el dataset (HTTP {e.code}). Verifica la URL.")
    except urllib.error.URLError as e:
        raise ValueError(f"No se pudo acceder a la URL del dataset: {e.reason}")
    return _extract_zip(zip_path, workspace_id, execution_id)


def _extract_zip(zip_path: Path, workspace_id: str, execution_id: str) -> str:
    extract_dir = (Path(settings.storage_base_path) /
                   workspace_id / "extracted" / execution_id)
    extract_dir.mkdir(parents=True, exist_ok=True)
    try:
        with zipfile.ZipFile(zip_path, "r") as zf:
            # Protección contra zip-slip (rutas con ../ o absolutas).
            for member in zf.namelist():
                target = (extract_dir / member).resolve()
                if not str(target).startswith(str(extract_dir.resolve())):
                    raise ValueError("El ZIP contiene rutas no seguras (zip-slip).")
            zf.extractall(extract_dir)
    except zipfile.BadZipFile:
        raise ValueError(
            "El archivo no es un ZIP válido. Sube un .zip de imágenes con carpetas por clase "
            "(o splits train/val/test).")
    log.info("ZIP extraído en: %s", extract_dir)
    return str(extract_dir)
