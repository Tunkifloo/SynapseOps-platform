"""
Responsabilidad única: entrenar con PyTorch.
CNN adaptativa al input_shape detectado por ingestion.
"""
import logging
from pathlib import Path
from typing import Optional

import numpy as np

from app.pipeline.training import augmentation, scorecam
from app.pipeline.training.base import (
    EpochCallback, HyperParams, PhaseCallback, TrainingResult, TrainingStrategy,
)

log = logging.getLogger(__name__)


class PyTorchStrategy(TrainingStrategy):
    """
    Strategy PyTorch — CNN adaptativa.
    - input_shape (H<=32) → 2 bloques conv
    - input_shape (H>32)  → 3 bloques conv
    Detección automática CUDA / MPS / CPU.
    """

    def train(
        self,
        X_train: np.ndarray,
        y_train: np.ndarray,
        X_val:   np.ndarray,
        y_val:   np.ndarray,
        hyperparams: HyperParams,
        output_dir: str,
        X_test: Optional[np.ndarray] = None,
        y_test: Optional[np.ndarray] = None,
        on_epoch: Optional[EpochCallback] = None,
        class_names: Optional[list] = None,
        on_phase: Optional[PhaseCallback] = None,
    ) -> TrainingResult:
        import torch
        import torch.nn as nn
        from torch.utils.data import DataLoader, TensorDataset

        device = self._resolve_device()
        log.info("PyTorch %s — device=%s shape=%s classes=%d",
                 torch.__version__, device,
                 hyperparams.input_shape, hyperparams.num_classes)

        # Datos en CPU (uint8 si aplica para ahorrar RAM 4×). CLAVE: el dataset NO se sube
        # entero a la VRAM — a 224px eran varios GB → OOM en GPUs de lab. El DataLoader mueve
        # cada LOTE a `device` (pin_memory acelera la copia en CUDA) y el cast a float [0,1]
        # se hace por lote (uint8→/255; float builtins/zscore → tal cual). Val/test se
        # evalúan también por lotes (_evaluate), sin materializarse en VRAM.
        use_cuda = device.type == "cuda"

        def _to_cpu_tensor(arr):
            t = torch.tensor(np.transpose(arr, (0, 3, 1, 2)))
            return t if t.dtype == torch.uint8 else t.float()

        Xtr = _to_cpu_tensor(X_train)
        ytr = torch.tensor(y_train, dtype=torch.long)
        Xv  = _to_cpu_tensor(X_val)
        yv  = torch.tensor(y_val, dtype=torch.long)

        loader    = DataLoader(
            TensorDataset(Xtr, ytr),
            batch_size=hyperparams.batch_size, shuffle=True, pin_memory=use_cuda)
        criterion = nn.CrossEntropyLoss()
        # Augmentation in-graph (torchvision.transforms.v2 + ruido custom), construida
        # desde el mismo catálogo normalizado. None si no hay técnicas activas.
        augment = self._build_aug(hyperparams)
        if augment is not None:
            log.info("Augmentation in-graph (PyTorch) activa.")

        arch = (hyperparams.architecture or "cnn").lower()
        if arch == "cnn":
            model = self._build_cnn(hyperparams).to(device)
            optimizer = self._build_optimizer(model, hyperparams)
            history = self._train_loop(
                model, loader, Xv, yv, optimizer, criterion, augment, device,
                hyperparams, hyperparams.epochs, 0, hyperparams.epochs, None, on_epoch)
        else:
            # Transfer Learning en 2 fases: Feature Extraction → Fine-Tuning.
            model, head = self._build_pretrained(arch, hyperparams)
            model = model.to(device)
            fe_ep = hyperparams.feature_extraction_epochs
            ft_ep = hyperparams.finetuning_epochs
            total = fe_ep + ft_ep
            log.info("TL %s — FE %d ep (lr=%.0e) → FT %d ep (lr=%.0e, descongela %d capas)",
                     arch, fe_ep, hyperparams.feature_extraction_lr,
                     ft_ep, hyperparams.finetuning_lr, hyperparams.unfreeze_layers)
            if on_phase is not None:
                on_phase({"phase": "FE", "epochs": fe_ep,
                          "lr": hyperparams.feature_extraction_lr})
            # ── FE: caché de embeddings (solo sin augmentation) ──────────────────
            # Backbone congelado → embeddings deterministas: se calculan UNA vez y se entrena
            # solo la cabeza (se reusa _train_loop con la cabeza como "modelo"). Con
            # augmentation las imágenes cambian por época → FE corre sobre imágenes.
            if fe_ep <= 0:
                h1 = {}
            elif augment is None:
                emb_train = self._extract_embeddings(model, arch, Xtr, device, hyperparams.batch_size)
                emb_val = self._extract_embeddings(model, arch, Xv, device, hyperparams.batch_size)
                emb_loader = DataLoader(
                    TensorDataset(emb_train, ytr),
                    batch_size=hyperparams.batch_size, shuffle=True, pin_memory=use_cuda)
                opt1 = self._build_optimizer(head, hyperparams, hyperparams.feature_extraction_lr)
                log.info("FE con caché de embeddings (dim=%d; backbone no se re-ejecuta).",
                         emb_train.shape[1])
                h1 = self._train_loop(head, emb_loader, emb_val, yv, opt1, criterion, None,
                                      device, hyperparams, fe_ep, 0, total, "FE", on_epoch)
                del emb_train, emb_val, emb_loader
            else:
                opt1 = self._build_optimizer(model, hyperparams, hyperparams.feature_extraction_lr)
                h1 = self._train_loop(model, loader, Xv, yv, opt1, criterion, augment, device,
                                      hyperparams, fe_ep, 0, total, "FE", on_epoch)
            # ── FT: imágenes crudas (los gradientes fluyen por el backbone) ──────
            h2 = {}
            if ft_ep > 0:
                self._unfreeze_torch(model, arch, hyperparams.unfreeze_layers)
                if on_phase is not None:
                    on_phase({"phase": "FT", "epochs": ft_ep,
                              "lr": hyperparams.finetuning_lr,
                              "unfreeze": hyperparams.unfreeze_layers})
                opt2 = self._build_optimizer(model, hyperparams, hyperparams.finetuning_lr)
                h2 = self._train_loop(model, loader, Xv, yv, opt2, criterion, augment, device,
                                      hyperparams, ft_ep, fe_ep, total, "FT", on_epoch)
            history = {k: list(h1.get(k, [])) + list(h2.get(k, []))
                       for k in set(h1) | set(h2)}

        # Predicciones de train y validación para métricas avanzadas (item 7). Por lotes
        # (datos en CPU → cada lote a device); nunca materializa el train entero en VRAM.
        model.eval()
        train_proba = self._predict_proba(model, Xtr, hyperparams.batch_size, device)
        train_pred = train_proba.argmax(axis=1)
        train_true = np.asarray(y_train)
        val_proba = self._predict_proba(model, Xv, hyperparams.batch_size, device)
        val_pred = val_proba.argmax(axis=1)

        # Evaluación final sobre el split de test (si lo hay), también por lotes.
        test_accuracy = test_loss = None
        test_true = test_pred = test_proba = None
        if X_test is not None and y_test is not None and len(X_test) > 0:
            Xte = _to_cpu_tensor(X_test)
            yte = torch.tensor(y_test, dtype=torch.long)
            test_loss, test_accuracy, test_proba = self._evaluate(
                model, Xte, yte, criterion, device, hyperparams.batch_size)
            test_pred = test_proba.argmax(axis=1)
            test_true = np.asarray(y_test)
            log.info("Evaluación en test — loss=%.4f acc=%.4f", test_loss, test_accuracy)

        # Interpretabilidad Score-CAM (best-effort) ANTES de mover el modelo a CPU.
        cam_X, cam_y = ((X_test, y_test) if X_test is not None and len(X_test) > 0
                        else (X_val, y_val))
        gallery = scorecam.generate("pytorch", model, np.asarray(cam_X), np.asarray(cam_y),
                                    class_names, output_dir, device=device)

        # ── Serialización como TorchScript (TA-007 · Sprint 3) ────────────────
        # El model-service carga el artefacto con torch.jit.load, que NO requiere
        # el código fuente de la clase CNN. Por eso se guarda TorchScript
        # autocontenido en lugar de un state_dict (que exigiría redefinir la clase
        # al cargar). Se intenta script() y, ante construcciones no soportadas, se
        # cae a trace() con un tensor de ejemplo NCHW del input_shape entrenado.
        artifact_path = str(Path(output_dir) / "model.pt")
        h, w, c = hyperparams.input_shape
        scripted = model.to("cpu").eval()
        try:
            ts_model = torch.jit.script(scripted)
        except Exception as exc:  # noqa: BLE001 — fallback robusto
            log.warning("torch.jit.script falló (%s); usando torch.jit.trace.", exc)
            example = torch.zeros((1, c, h, w), dtype=torch.float32)
            ts_model = torch.jit.trace(scripted, example)
        ts_model.save(artifact_path)
        log.info("Modelo PyTorch (TorchScript) guardado: %s", artifact_path)

        return TrainingResult(
            framework="pytorch",
            history=history,
            artifact_path=artifact_path,
            final_accuracy=history.get("val_accuracy", history.get("accuracy", [0]))[-1],
            final_loss=history.get("val_loss", history.get("loss", [0]))[-1],
            test_accuracy=test_accuracy,
            test_loss=test_loss,
            train_true=train_true, train_pred=train_pred, train_proba=train_proba,
            val_true=np.asarray(y_val), val_pred=val_pred, val_proba=val_proba,
            test_true=test_true, test_pred=test_pred, test_proba=test_proba,
            interpretability_path=gallery,
        )

    def _build_aug(self, hp: HyperParams):
        """Callable que augmenta un batch (N,C,H,W) en [0,1], o None si no hay técnicas.

        Paritario con TensorFlow: mismas técnicas y parámetros desde el catálogo
        normalizado. El ruido gaussiano es una transformación custom (suma N(0,std)).
        """
        cfg = augmentation.normalize_config(hp.augmentation_config, hp.data_augmentation)
        if not cfg:
            return None
        import torch
        from torchvision.transforms import v2

        channels = hp.input_shape[-1]
        size = (hp.input_shape[0], hp.input_shape[1])
        tfs = []
        if "flipH" in cfg:
            tfs.append(v2.RandomHorizontalFlip(p=cfg["flipH"]["prob"]))
        if "flipV" in cfg:
            tfs.append(v2.RandomVerticalFlip(p=cfg["flipV"]["prob"]))
        if "rotation" in cfg:
            tfs.append(v2.RandomRotation(degrees=cfg["rotation"]["maxDeg"]))
        if "translation" in cfg:
            f = cfg["translation"]["fraction"]
            tfs.append(v2.RandomAffine(degrees=0, translate=(f, f)))
        if "zoom" in cfg:
            s = min(0.9, cfg["zoom"]["scale"])
            tfs.append(v2.RandomResizedCrop(size=size, scale=(1.0 - s, 1.0), antialias=True))
        cj = {}
        if "brightness" in cfg:
            cj["brightness"] = cfg["brightness"]["factor"]
        if "contrast" in cfg:
            cj["contrast"] = cfg["contrast"]["factor"]
        if "saturation" in cfg and channels == 3:
            cj["saturation"] = cfg["saturation"]["factor"]
        if cj:
            tfs.append(v2.ColorJitter(**cj))
        if "sharpness" in cfg:
            tfs.append(v2.RandomAdjustSharpness(
                sharpness_factor=cfg["sharpness"]["intensity"], p=0.5))
        compose = v2.Compose(tfs) if tfs else None
        std = cfg.get("gaussianNoise", {}).get("std")

        def apply(xb):
            if compose is not None:
                xb = compose(xb)
            if std:
                xb = torch.clamp(xb + torch.randn_like(xb) * std, 0.0, 1.0)
            return xb

        return apply

    def _train_loop(self, model, loader, Xv, yv, optimizer, criterion, augment, device,
                    hp: HyperParams, epochs: int, offset: int, total: int,
                    phase: "str | None", on_epoch) -> dict:
        """Bucle de entrenamiento de una fase. Devuelve history; restaura los mejores
        pesos si hay early stopping. Reporta epochs continuas (offset/total) y fase."""
        import torch
        history = {"accuracy": [], "loss": [], "val_accuracy": [], "val_loss": []}
        if epochs <= 0:
            return history
        best_loss = best_acc = best_state = None
        no_improve = 0
        for epoch in range(epochs):
            model.train()
            ep_loss, correct, total_n = 0.0, 0, 0
            for xb, yb in loader:
                # Lote CPU → device (los datos residen en CPU; solo el lote ocupa VRAM).
                xb = xb.to(device, non_blocking=True)
                yb = yb.to(device, non_blocking=True)
                # Cast a float [0,1] por lote: uint8 → /255; float (zscore/builtins) → tal cual.
                xb = xb.float() / 255.0 if xb.dtype == torch.uint8 else xb.float()
                if augment is not None:
                    xb = augment(xb)
                optimizer.zero_grad()
                out = model(xb)
                loss = criterion(out, yb)
                loss.backward()
                optimizer.step()
                ep_loss += loss.item() * len(yb)
                correct += (out.argmax(1) == yb).sum().item()
                total_n += len(yb)
            acc, avg_loss = correct / total_n, ep_loss / total_n

            # Validación por lotes (Xv/yv en CPU → cada lote a device): no ocupa VRAM extra.
            vloss, vacc, _ = self._evaluate(model, Xv, yv, criterion, device, hp.batch_size)

            history["accuracy"].append(acc)
            history["loss"].append(avg_loss)
            history["val_accuracy"].append(vacc)
            history["val_loss"].append(vloss)
            tag = f" [{phase}]" if phase else ""
            log.info("Epoch %d/%d%s loss=%.4f acc=%.4f val_acc=%.4f",
                     offset + epoch + 1, total, tag, avg_loss, acc, vacc)
            if on_epoch is not None:
                m = {"loss": avg_loss, "accuracy": acc, "val_loss": vloss, "val_accuracy": vacc}
                if phase:
                    m["phase"] = phase
                on_epoch(offset + epoch + 1, total, m)

            if hp.early_stopping:
                # "both": mejora si val_loss baja O val_accuracy sube (resetea paciencia);
                # para solo cuando NINGUNA mejora. val_loss/val_accuracy: una sola métrica.
                mode = hp.es_monitor
                imp_loss = (mode in ("val_loss", "both")) and (best_loss is None or vloss < best_loss)
                imp_acc = (mode in ("val_accuracy", "both")) and (best_acc is None or vacc > best_acc)
                if imp_loss:
                    best_loss = vloss
                if imp_acc:
                    best_acc = vacc
                if imp_loss or imp_acc:
                    best_state = {k: v.detach().clone() for k, v in model.state_dict().items()}
                    no_improve = 0
                else:
                    no_improve += 1
                    if no_improve >= max(1, hp.es_patience):
                        log.info("EarlyStopping en epoch %d (monitor=%s)",
                                 offset + epoch + 1, hp.es_monitor)
                        break
        if best_state is not None:
            model.load_state_dict(best_state)
        return history

    def _predict_proba(self, model, X, batch_size: int, device) -> np.ndarray:
        """Softmax por lotes. X reside en CPU; cada lote se mueve a `device` y se castea a
        float [0,1] (uint8→/255). Evita materializar todo el split en VRAM (clave a 224px)."""
        import torch
        model.eval()
        outs = []
        bs = max(1, batch_size)
        with torch.no_grad():
            for i in range(0, len(X), bs):
                xb = X[i:i + bs].to(device, non_blocking=True)
                xb = xb.float() / 255.0 if xb.dtype == torch.uint8 else xb.float()
                outs.append(torch.softmax(model(xb), dim=1).cpu().numpy())
        return np.concatenate(outs) if outs else np.empty((0,))

    def _evaluate(self, model, X, y, criterion, device, batch_size: int):
        """Evalúa (loss, accuracy, probas) por lotes moviendo cada lote CPU→device. No
        materializa el split entero en VRAM. Devuelve (loss_media, acc, proba np.ndarray)."""
        import torch
        model.eval()
        bs = max(1, batch_size)
        tot_loss, correct, n = 0.0, 0, 0
        outs = []
        with torch.no_grad():
            for i in range(0, len(X), bs):
                xb = X[i:i + bs].to(device, non_blocking=True)
                yb = y[i:i + bs].to(device, non_blocking=True)
                xb = xb.float() / 255.0 if xb.dtype == torch.uint8 else xb.float()
                out = model(xb)
                tot_loss += float(criterion(out, yb).item()) * len(yb)
                correct += int((out.argmax(1) == yb).sum().item())
                n += len(yb)
                outs.append(torch.softmax(out, dim=1).cpu().numpy())
        loss = tot_loss / max(1, n)
        acc = correct / max(1, n)
        return loss, acc, (np.concatenate(outs) if outs else np.empty((0,)))

    def _extract_embeddings(self, model, arch: str, X, device, batch_size: int):
        """Backbone congelado → embeddings (N, D) en CPU, por lotes (no ocupa VRAM).
        Reemplaza temporalmente la cabeza por Identity → la salida del modelo ES el
        embedding pooled; restaura la cabeza al terminar (sus pesos siguen intactos)."""
        import torch
        import torch.nn as nn
        is_resnet = arch.lower() == "resnet"
        head = model.fc if is_resnet else model.classifier
        ident = nn.Identity()
        if is_resnet:
            model.fc = ident
        else:
            model.classifier = ident
        model.eval()
        outs = []
        bs = max(1, batch_size)
        try:
            with torch.no_grad():
                for i in range(0, len(X), bs):
                    xb = X[i:i + bs].to(device, non_blocking=True)
                    xb = xb.float() / 255.0 if xb.dtype == torch.uint8 else xb.float()
                    outs.append(model(xb).detach().cpu())
        finally:
            if is_resnet:
                model.fc = head
            else:
                model.classifier = head
        return torch.cat(outs) if outs else torch.empty((0,))

    def _build_pretrained(self, arch: str, hp: HyperParams):
        """Backbone ImageNet de torchvision con cabeza nueva. Devuelve (model, head).
        El backbone arranca congelado (solo la cabeza entrena en feature extraction)."""
        import torch.nn as nn
        import torchvision.models as models
        name = arch.lower()
        drop = hp.dropout

        def head(in_f):
            return nn.Sequential(
                nn.Dropout(drop), nn.Linear(in_f, 256), nn.ReLU(inplace=True),
                nn.Dropout(max(0.0, drop * 0.75)), nn.Linear(256, hp.num_classes))

        if name == "efficientnet":
            m = models.efficientnet_b0(weights=models.EfficientNet_B0_Weights.IMAGENET1K_V1)
            m.classifier = head(m.classifier[1].in_features); head_mod = m.classifier
        elif name == "mobilenet":
            m = models.mobilenet_v2(weights=models.MobileNet_V2_Weights.IMAGENET1K_V1)
            m.classifier = head(m.classifier[1].in_features); head_mod = m.classifier
        elif name == "resnet":
            m = models.resnet50(weights=models.ResNet50_Weights.IMAGENET1K_V1)
            m.fc = head(m.fc.in_features); head_mod = m.fc
        else:
            raise ValueError(f"Backbone no soportado: {arch}")

        for p in m.parameters():
            p.requires_grad = False
        for p in head_mod.parameters():
            p.requires_grad = True
        log.info("Backbone %s instanciado (params=%d).",
                 name, sum(p.numel() for p in m.parameters()))
        return m, head_mod

    def _unfreeze_torch(self, model, arch: str, n: int) -> None:
        """Descongela las últimas `n` etapas del backbone para el fine-tuning."""
        name = arch.lower()
        if name in ("efficientnet", "mobilenet"):
            stages = list(model.features)
        else:  # resnet
            stages = [model.conv1, model.bn1, model.layer1,
                      model.layer2, model.layer3, model.layer4]
        for stage in stages[-max(1, n):]:
            for p in stage.parameters():
                p.requires_grad = True

    def _build_optimizer(self, model, hp: HyperParams, lr: "float | None" = None):
        import torch
        lr = lr if lr is not None else hp.learning_rate
        wd = hp.l2 if hp.l2 and hp.l2 > 0 else 0.0
        params = filter(lambda p: p.requires_grad, model.parameters())
        opt = (hp.optimizer or "adam").lower()
        if opt == "adamw":
            return torch.optim.AdamW(params, lr=lr, weight_decay=wd)
        if opt == "sgd":
            return torch.optim.SGD(params, lr=lr, momentum=0.9, weight_decay=wd)
        if opt == "rmsprop":
            return torch.optim.RMSprop(params, lr=lr, weight_decay=wd)
        return torch.optim.Adam(params, lr=lr, weight_decay=wd)

    def _build_cnn(self, hp: HyperParams):
        import torch.nn as nn

        h, w, c   = hp.input_shape
        bn        = hp.batch_norm
        filters   = [32, 64] if h <= 32 else [32, 64, 128]
        divisor   = 4 if h <= 32 else 8

        def block(cin, cout):
            layers = [nn.Conv2d(cin, cout, 3, padding=1)]
            if bn:
                layers.append(nn.BatchNorm2d(cout))
            layers += [nn.ReLU(), nn.MaxPool2d(2)]
            return layers

        class CNN(nn.Module):
            def __init__(self):
                super().__init__()
                seq, cin = [], c
                for f in filters:
                    seq += block(cin, f)
                    cin = f
                self.features = nn.Sequential(*seq)
                feat = filters[-1] * (h // divisor) * (w // divisor)
                self.classifier = nn.Sequential(
                    nn.Flatten(),
                    nn.Linear(feat, 256), nn.ReLU(),
                    nn.Dropout(hp.dropout),
                    nn.Linear(256, hp.num_classes),
                )

            def forward(self, x):
                return self.classifier(self.features(x))

        return CNN()

    def _resolve_device(self):
        import torch
        if torch.cuda.is_available():
            log.info("CUDA: %s", torch.cuda.get_device_name(0))
            return torch.device("cuda")
        if hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
            log.info("Apple MPS disponible")
            return torch.device("mps")
        log.info("Usando CPU")
        return torch.device("cpu")