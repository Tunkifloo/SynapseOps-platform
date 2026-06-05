"""
Responsabilidad única: entrenar con PyTorch.
CNN adaptativa al input_shape detectado por ingestion.
"""
import logging
from pathlib import Path
from typing import Optional

import numpy as np

from app.pipeline.training.base import HyperParams, TrainingResult, TrainingStrategy

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
        optimizer = torch.optim.Adam(
            model.parameters(), lr=hyperparams.learning_rate)
        criterion = nn.CrossEntropyLoss()

        history = {"accuracy": [], "loss": [], "val_accuracy": [], "val_loss": []}

        for epoch in range(hyperparams.epochs):
            model.train()
            ep_loss, correct, total = 0.0, 0, 0
            for xb, yb in loader:
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

        # Evaluación final sobre el split de test (si lo hay).
        test_accuracy = test_loss = None
        if X_test is not None and y_test is not None and len(X_test) > 0:
            Xte = torch.tensor(np.transpose(X_test, (0, 3, 1, 2)), dtype=torch.float32).to(device)
            yte = torch.tensor(y_test, dtype=torch.long).to(device)
            model.eval()
            with torch.no_grad():
                out = model(Xte)
                test_loss = float(criterion(out, yte).item())
                test_accuracy = float((out.argmax(1) == yte).float().mean().item())
            log.info("Evaluación en test — loss=%.4f acc=%.4f", test_loss, test_accuracy)

        artifact_path = str(Path(output_dir) / "model.pt")
        torch.save({
            "state_dict":  model.state_dict(),
            "input_shape": hyperparams.input_shape,
            "num_classes": hyperparams.num_classes,
        }, artifact_path)
        log.info("Modelo PyTorch guardado: %s", artifact_path)

        return TrainingResult(
            framework="pytorch",
            history=history,
            artifact_path=artifact_path,
            final_accuracy=history["accuracy"][-1],
            final_loss=history["loss"][-1],
            test_accuracy=test_accuracy,
            test_loss=test_loss,
        )

    def _build_cnn(self, hp: HyperParams):
        import torch.nn as nn

        h, w, c  = hp.input_shape
        is_small = h <= 32

        class CNN(nn.Module):
            def __init__(self):
                super().__init__()
                if is_small:
                    self.features = nn.Sequential(
                        nn.Conv2d(c, 32, 3, padding=1), nn.ReLU(),
                        nn.MaxPool2d(2),
                        nn.Conv2d(32, 64, 3, padding=1), nn.ReLU(),
                        nn.MaxPool2d(2),
                    )
                    feat = 64 * (h // 4) * (w // 4)
                else:
                    self.features = nn.Sequential(
                        nn.Conv2d(c, 32, 3, padding=1), nn.ReLU(),
                        nn.MaxPool2d(2),
                        nn.Conv2d(32, 64, 3, padding=1), nn.ReLU(),
                        nn.MaxPool2d(2),
                        nn.Conv2d(64, 128, 3, padding=1), nn.ReLU(),
                        nn.MaxPool2d(2),
                    )
                    feat = 128 * (h // 8) * (w // 8)

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