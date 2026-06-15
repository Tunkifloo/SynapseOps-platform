"""
Pre-descarga de los pesos ImageNet de los backbones (Transfer Learning) en tiempo
de BUILD, para que la imagen funcione OFFLINE en los laboratorios.

Por qué en build y no en runtime: `docker save` exporta la imagen (sus capas), NO la
capa de escritura del contenedor. Si los pesos se descargaran al entrenar, vivirían en
esa capa efímera y NO viajarían en el tar de distribución. Horneándolos aquí quedan en
una capa permanente de la imagen.

CADA modelo se construye en su PROPIO subproceso:
  - Memoria fresca por modelo → evita el Segmentation fault por memoria acumulada al
    instanciar los 3 backbones (sobre todo ResNet50) en un mismo proceso, observado con
    tensorflow[and-cuda] en el contenedor de build.
  - La descarga del .h5 ocurre ANTES de construir el grafo, así que aunque un subproceso
    caiga tras descargar, el peso ya queda cacheado en ~/.keras/models y el build sigue.
Se fuerza CPU (no hay GPU en el build). Best-effort: nunca rompe el build.
"""
import os
import subprocess
import sys

# Forzar CPU antes de cualquier import de TF en los subprocesos (sin GPU en build).
os.environ["CUDA_VISIBLE_DEVICES"] = "-1"
os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "3")

# (etiqueta, código a ejecutar en un subproceso aislado)
_JOBS = [
    ("TF EfficientNetB0",
     "import tensorflow as tf; tf.keras.applications.EfficientNetB0(weights='imagenet', include_top=False)"),
    ("TF MobileNetV2",
     "import tensorflow as tf; tf.keras.applications.MobileNetV2(weights='imagenet', include_top=False)"),
    ("TF ResNet50",
     "import tensorflow as tf; tf.keras.applications.ResNet50(weights='imagenet', include_top=False)"),
    ("torch efficientnet_b0",
     "import torchvision.models as m; m.efficientnet_b0(weights=m.EfficientNet_B0_Weights.IMAGENET1K_V1)"),
    ("torch mobilenet_v2",
     "import torchvision.models as m; m.mobilenet_v2(weights=m.MobileNet_V2_Weights.IMAGENET1K_V1)"),
    ("torch resnet50",
     "import torchvision.models as m; m.resnet50(weights=m.ResNet50_Weights.IMAGENET1K_V1)"),
]


def main() -> int:
    for label, code in _JOBS:
        try:
            result = subprocess.run([sys.executable, "-c", code], env=dict(os.environ))
            if result.returncode == 0:
                print(f"[precache] {label}: OK")
            else:
                # Código != 0 (p. ej. 139 segfault al construir el grafo): el peso ya se
                # descargó antes de construir, así que queda cacheado. No rompemos el build.
                print(f"[precache] {label}: subproceso código {result.returncode} "
                      f"(peso cacheado si la descarga concluyó)")
        except Exception as exc:  # noqa: BLE001
            print(f"[precache] {label}: omitido ({exc})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
