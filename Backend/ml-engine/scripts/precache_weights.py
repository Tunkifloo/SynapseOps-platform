"""
Pre-descarga de los pesos ImageNet de los backbones (Transfer Learning) en tiempo
de BUILD, para que la imagen funcione OFFLINE en los laboratorios.

Por qué en build y no en runtime: `docker save` exporta la imagen (sus capas), NO la
capa de escritura del contenedor. Si los pesos se descargaran al entrenar, vivirían en
esa capa efímera y NO viajarían en el tar de distribución. Horneándolos aquí quedan en
una capa permanente de la imagen.

Se ejecuta como el usuario `mlengine` (mismo HOME que en runtime → el cache de
~/.keras y ~/.cache/torch coincide). Best-effort por framework: si uno no está
instalado en este perfil de requirements, se omite sin fallar el build.
"""
import sys


def _cache_tensorflow() -> None:
    import tensorflow as tf  # noqa: import diferido
    # include_top=False = exactamente como los instancia tensorflow_strategy._build_pretrained.
    tf.keras.applications.EfficientNetB0(weights="imagenet", include_top=False)
    tf.keras.applications.MobileNetV2(weights="imagenet", include_top=False)
    tf.keras.applications.ResNet50(weights="imagenet", include_top=False)
    print("[precache] pesos TensorFlow (EfficientNetB0/MobileNetV2/ResNet50) en caché.")


def _cache_torch() -> None:
    import torchvision.models as m  # noqa: import diferido
    m.efficientnet_b0(weights=m.EfficientNet_B0_Weights.IMAGENET1K_V1)
    m.mobilenet_v2(weights=m.MobileNet_V2_Weights.IMAGENET1K_V1)
    m.resnet50(weights=m.ResNet50_Weights.IMAGENET1K_V1)
    print("[precache] pesos PyTorch/torchvision (efficientnet_b0/mobilenet_v2/resnet50) en caché.")


def main() -> int:
    for name, fn in (("tensorflow", _cache_tensorflow), ("torch", _cache_torch)):
        try:
            fn()
        except Exception as exc:  # noqa: BLE001 — no romper el build por un framework ausente
            print(f"[precache] {name} omitido: {exc}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
