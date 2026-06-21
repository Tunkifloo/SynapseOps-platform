"""
Optimización automática de hiperparámetros (HPO) con Optuna.

Se eligió Optuna sobre Ray Tune: es puro-Python y liviano, encaja con el consumidor
serial del ml-engine y el presupuesto de RAM (Ray levantaría un cluster). Cada *trial*
entrena un modelo PROXY (subconjunto del train + pocas epochs, vía `strategy.train(quick=True)`)
y devuelve la accuracy de validación; al final el executor reentrena UNA vez con los mejores
hiperparámetros sobre el dataset completo. El espacio de búsqueda depende de la arquitectura.
"""
import logging
import tempfile

import numpy as np

log = logging.getLogger(__name__)


def _subsample(X: np.ndarray, y: np.ndarray, max_n: int, seed: int = 42):
    """Submuestreo estratificado-aproximado (aleatorio determinista) para los trials.
    Mantener los trials baratos es clave: el coste de HPO ≈ n_trials × proxy."""
    if max_n <= 0 or len(X) <= max_n:
        return X, y
    rng = np.random.default_rng(seed)
    idx = np.sort(rng.choice(len(X), size=max_n, replace=False))
    return X[idx], y[idx]


def _suggest(trial, arch: str) -> dict:
    """Espacio de búsqueda. batch_size NO se optimiza: lo fija el usuario (control de
    memoria). Se optimizan LR, dropout, optimizador y L2; en backbones además los LR de
    cada fase y las capas a descongelar."""
    params = {
        "learning_rate": trial.suggest_float("learning_rate", 1e-4, 1e-2, log=True),
        "dropout":       trial.suggest_float("dropout", 0.2, 0.6),
        "optimizer":     trial.suggest_categorical("optimizer", ["adam", "adamw", "rmsprop"]),
        "l2":            trial.suggest_categorical("l2", [0.0, 1e-4, 1e-3]),
    }
    if arch != "cnn":
        params["feature_extraction_lr"] = trial.suggest_float(
            "feature_extraction_lr", 1e-4, 1e-2, log=True)
        params["finetuning_lr"] = trial.suggest_float(
            "finetuning_lr", 1e-6, 1e-4, log=True)
        params["unfreeze_layers"] = trial.suggest_int("unfreeze_layers", 2, 20)
    return params


def run_study(job, bundle, strategy, build_hp, n_trials: int,
              trial_epochs: int, trial_max_images: int, emit, cleanup=None) -> dict:
    """Ejecuta el estudio Optuna y devuelve el dict de mejores hiperparámetros.

    `build_hp(params, epochs)` lo provee el executor (sabe construir HyperParams).
    `emit(msg)` publica progreso por SSE. `cleanup()` (opcional) libera la sesión TF / caché
    torch entre trials para que los grafos no se acumulen. Maximiza la accuracy de validación.
    """
    import optuna

    optuna.logging.set_verbosity(optuna.logging.WARNING)
    arch = (job.architecture or "cnn").lower()
    Xs, ys = _subsample(bundle.X_train, bundle.y_train, trial_max_images)
    Xv, yv = bundle.X_val, bundle.y_val
    log.info("HPO: %d trials · proxy=%d epochs sobre %d imágenes (arch=%s)",
             n_trials, trial_epochs, len(Xs), arch)

    def objective(trial):
        params = _suggest(trial, arch)
        hp = build_hp(params, trial_epochs)

        # Pruning: reporta val_accuracy por época; si el trial va claramente peor que la
        # mediana de los anteriores en ese mismo punto, se corta (ahorra cómputo → permite
        # más epochs por trial sin disparar el tiempo total).
        def _report(epoch, _total, metrics):
            va = metrics.get("val_accuracy")
            if va is not None:
                trial.report(float(va), epoch)
                if trial.should_prune():
                    raise optuna.TrialPruned()

        try:
            with tempfile.TemporaryDirectory() as d:
                res = strategy.train(Xs, ys, Xv, yv, hp, d, quick=True, on_epoch=_report)
            val = float(res.final_accuracy or 0.0)
            extra = ""
            if arch != "cnn":
                extra = (f" · fe_lr={params['feature_extraction_lr']:.1e} "
                         f"ft_lr={params['finetuning_lr']:.1e} unfreeze={params['unfreeze_layers']}")
            emit(f"HPO trial {trial.number + 1}/{n_trials}: val_acc={val:.4f} · "
                 f"lr={params['learning_rate']:.1e} dropout={params['dropout']:.2f} "
                 f"opt={params['optimizer']} l2={params['l2']:g}{extra}")
            return val
        except optuna.TrialPruned:
            emit(f"HPO trial {trial.number + 1}/{n_trials}: descartado temprano (bajo rendimiento).")
            raise
        except Exception as e:  # noqa: BLE001 — un trial que falla no aborta el estudio
            log.warning("HPO trial %d falló (%s); se descarta.", trial.number, e)
            emit(f"HPO trial {trial.number + 1}/{n_trials}: descartado ({e}).")
            return 0.0
        finally:
            if cleanup is not None:
                try:
                    cleanup()
                except Exception:  # noqa: BLE001
                    pass

    # MedianPruner: tras 3 trials de calentamiento, corta los que en una época dada quedan
    # por debajo de la mediana histórica (no antes de la 1ª época, n_warmup_steps=1).
    study = optuna.create_study(
        direction="maximize",
        pruner=optuna.pruners.MedianPruner(n_startup_trials=3, n_warmup_steps=1))
    study.optimize(objective, n_trials=n_trials)
    n_pruned = sum(1 for t in study.trials if t.state == optuna.trial.TrialState.PRUNED)
    emit(f"HPO completado: mejor val_acc={study.best_value:.4f} "
         f"({n_pruned} de {n_trials} combinaciones descartadas temprano).")
    log.info("HPO mejores params: %s", study.best_params)
    return dict(study.best_params)
