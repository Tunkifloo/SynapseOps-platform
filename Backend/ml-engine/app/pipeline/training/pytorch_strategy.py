"""
Responsabilidad única: entrenar con PyTorch.
CNN adaptativa al input_shape detectado por ingestion.
"""
import logging
from pathlib import Path
from typing import Optional

import numpy as np

from app.pipeline.training.base import EpochCallback, HyperParams, TrainingResult, TrainingStrategy

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
    ) -> TrainingResult:
        import torch
        import torch.nn as nn
        from torch.utils.data import DataLoader, TensorDataset

        device = self._resolve_device()
        log.info("PyTorch %s — device=%s shape=%s classes=%d",
                 torch.__version__, device,
                 hyperparams.input_shape, hyperparams.num_classes)

        # numpy (N,H,W,C) → tensor (N,C,H,W)
        Xtr = torch.tensor(
            np.transpose(X_train, (0, 3, 1, 2)),
            dtype=torch.float32).to(device)
        ytr = torch.tensor(y_train, dtype=torch.long).to(device)
        Xv  = torch.tensor(
            np.transpose(X_val, (0, 3, 1, 2)),
            dtype=torch.float32).to(device)
        yv  = torch.tensor(y_val, dtype=torch.long).to(device)

        loader    = DataLoader(
            TensorDataset(Xtr, ytr),
            batch_size=hyperparams.batch_size, shuffle=True)
        model     = self._build_cnn(hyperparams).to(device)
        optimizer = self._build_optimizer(model, hyperparams)
        criterion = nn.CrossEntropyLoss()

        history = {"accuracy": [], "loss": [], "val_accuracy": [], "val_loss": []}
        # Early Stopping manual (item 6).
        best_metric = None
        best_state = None
        epochs_no_improve = 0

        for epoch in range(hyperparams.epochs):
            model.train()
            ep_loss, correct, total = 0.0, 0, 0
            for xb, yb in loader:
                if hyperparams.data_augmentation:
                    # Augmentation ligera: flip horizontal aleatorio del lote.
                    if torch.rand(1).item() < 0.5:
                        xb = torch.flip(xb, dims=[3])
                optimizer.zero_grad()
                out  = model(xb)
                loss = criterion(out, yb)
                loss.backward()
                optimizer.step()
                ep_loss  += loss.item() * len(yb)
                correct  += (out.argmax(1) == yb).sum().item()
                total    += len(yb)

            acc      = correct / total
            avg_loss = ep_loss  / total

            model.eval()
            with torch.no_grad():
                vo    = model(Xv)
                vloss = criterion(vo, yv).item()
                vacc  = (vo.argmax(1) == yv).float().mean().item()

            history["accuracy"].append(acc)
            history["loss"].append(avg_loss)
            history["val_accuracy"].append(vacc)
            history["val_loss"].append(vloss)

            log.info("Epoch %d/%d loss=%.4f acc=%.4f val_acc=%.4f",
                     epoch + 1, hyperparams.epochs, avg_loss, acc, vacc)

            if on_epoch is not None:
                on_epoch(epoch + 1, hyperparams.epochs, {
                    "loss": avg_loss, "accuracy": acc,
                    "val_loss": vloss, "val_accuracy": vacc,
                })

            # Early Stopping (item 6): monitor val_loss (min) o val_accuracy (max).
            if hyperparams.early_stopping:
                monitor_val = vacc if hyperparams.es_monitor == "val_accuracy" else vloss
                improved = (best_metric is None) or (
                    monitor_val > best_metric if hyperparams.es_monitor == "val_accuracy"
                    else monitor_val < best_metric)
                if improved:
                    best_metric = monitor_val
                    best_state = {k: v.detach().clone() for k, v in model.state_dict().items()}
                    epochs_no_improve = 0
                else:
                    epochs_no_improve += 1
                    if epochs_no_improve >= max(1, hyperparams.es_patience):
                        log.info("EarlyStopping en epoch %d (monitor=%s)", epoch + 1, hyperparams.es_monitor)
                        break

        # Restaura los mejores pesos si hubo early stopping.
        if best_state is not None:
            model.load_state_dict(best_state)

        # Predicciones de validación para métricas avanzadas (item 7).
        model.eval()
        with torch.no_grad():
            val_logits = model(Xv)
            val_proba = torch.softmax(val_logits, dim=1).cpu().numpy()
        val_pred = val_proba.argmax(axis=1)

        # Evaluación final sobre el split de test (si lo hay).
        test_accuracy = test_loss = None
        test_true = test_pred = test_proba = None
        if X_test is not None and y_test is not None and len(X_test) > 0:
            Xte = torch.tensor(np.transpose(X_test, (0, 3, 1, 2)), dtype=torch.float32).to(device)
            yte = torch.tensor(y_test, dtype=torch.long).to(device)
            model.eval()
            with torch.no_grad():
                out = model(Xte)
                test_loss = float(criterion(out, yte).item())
                test_accuracy = float((out.argmax(1) == yte).float().mean().item())
                test_proba = torch.softmax(out, dim=1).cpu().numpy()
            test_pred = test_proba.argmax(axis=1)
            test_true = np.asarray(y_test)
            log.info("Evaluación en test — loss=%.4f acc=%.4f", test_loss, test_accuracy)

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
            val_true=np.asarray(y_val), val_pred=val_pred, val_proba=val_proba,
            test_true=test_true, test_pred=test_pred, test_proba=test_proba,
        )

    def _build_optimizer(self, model, hp: HyperParams):
        import torch
        lr = hp.learning_rate
        opt = (hp.optimizer or "adam").lower()
        if opt == "adamw":
            return torch.optim.AdamW(model.parameters(), lr=lr)
        if opt == "sgd":
            return torch.optim.SGD(model.parameters(), lr=lr, momentum=0.9)
        if opt == "rmsprop":
            return torch.optim.RMSprop(model.parameters(), lr=lr)
        return torch.optim.Adam(model.parameters(), lr=lr)

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
                    nn.Dropout(0.4),
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