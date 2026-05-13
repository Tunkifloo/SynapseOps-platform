import logging
import time
from pathlib import Path

import numpy as np

from app.pipeline.training.base import HyperParams, TrainingResult, TrainingStrategy

log = logging.getLogger(__name__)


def _resolve_torch_device():

    import torch

    if torch.cuda.is_available():
        device = torch.device("cuda")
        log.info("PyTorch — CUDA disponible: %s (VRAM: %.1f GB)",
                 torch.cuda.get_device_name(0),
                 torch.cuda.get_device_properties(0).total_memory / 1e9)
    elif hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
        device = torch.device("mps")
        log.info("PyTorch — Apple MPS disponible")
    else:
        device = torch.device("cpu")
        log.info("PyTorch — GPU no disponible, usando CPU")

    return device


class PyTorchStrategy(TrainingStrategy):
    """Entrenamiento con PyTorch — CNN base con detección automática GPU/CPU."""

    def train(
        self,
        X_train: np.ndarray,
        y_train: np.ndarray,
        X_val: np.ndarray,
        y_val: np.ndarray,
        hyperparams: HyperParams,
        output_dir: str,
    ) -> TrainingResult:
        import torch
        import torch.nn as nn
        from torch.utils.data import DataLoader, TensorDataset

        device = _resolve_torch_device()
        log.info("PyTorch %s — device: %s — arquitectura: %s",
                 torch.__version__, device, hyperparams.architecture)

        X_tr = torch.tensor(X_train, dtype=torch.float32).to(device)
        y_tr = torch.tensor(y_train, dtype=torch.long).to(device)
        X_v  = torch.tensor(X_val,   dtype=torch.float32).to(device)
        y_v  = torch.tensor(y_val,   dtype=torch.long).to(device)

        train_loader = DataLoader(
            TensorDataset(X_tr, y_tr),
            batch_size=hyperparams.batch_size,
            shuffle=True,
        )

        model = self._build_model(hyperparams).to(device)
        optimizer = torch.optim.Adam(
            model.parameters(), lr=hyperparams.learning_rate)
        criterion = nn.CrossEntropyLoss()

        history: dict[str, list] = {
            "accuracy": [], "loss": [], "val_accuracy": [], "val_loss": []}

        for epoch in range(hyperparams.epochs):
            # ── Train ──────────────────────────────────────────────────────────
            model.train()
            epoch_loss, correct, total = 0.0, 0, 0
            for xb, yb in train_loader:
                optimizer.zero_grad()
                out = model(xb)
                loss = criterion(out, yb)
                loss.backward()
                optimizer.step()
                epoch_loss += loss.item() * len(yb)
                correct += (out.argmax(1) == yb).sum().item()
                total += len(yb)
            acc = correct / total
            avg_loss = epoch_loss / total

            # ── Validation ─────────────────────────────────────────────────────
            model.eval()
            with torch.no_grad():
                val_out  = model(X_v)
                val_loss = criterion(val_out, y_v).item()
                val_acc  = (val_out.argmax(1) == y_v).float().mean().item()

            history["accuracy"].append(acc)
            history["loss"].append(avg_loss)
            history["val_accuracy"].append(val_acc)
            history["val_loss"].append(val_loss)

            log.info(
                "Epoch %d/%d — loss=%.4f acc=%.4f val_loss=%.4f val_acc=%.4f",
                epoch + 1, hyperparams.epochs,
                avg_loss, acc, val_loss, val_acc,
            )

        artifact_path = str(Path(output_dir) / "model.pt")
        # Guardar state_dict + metadata del device para reproducibilidad
        torch.save({
            "state_dict": model.state_dict(),
            "architecture": hyperparams.architecture,
            "num_classes": hyperparams.num_classes,
            "device": str(device),
        }, artifact_path)
        log.info("Modelo PyTorch guardado → %s", artifact_path)

        return TrainingResult(
            framework="pytorch",
            history=history,
            artifact_path=artifact_path,
            final_accuracy=history["accuracy"][-1],
            final_loss=history["loss"][-1],
        )

    def _build_model(self, hp: HyperParams):
        import torch.nn as nn
        return nn.Sequential(
            nn.Flatten(),
            nn.Linear(784, 256),
            nn.ReLU(),
            nn.Dropout(0.3),
            nn.Linear(256, 128),
            nn.ReLU(),
            nn.Linear(128, hp.num_classes),
        )