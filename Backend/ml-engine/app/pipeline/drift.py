import logging
from pathlib import Path

import numpy as np
import pandas as pd

log = logging.getLogger(__name__)


def generate_drift_report(
    X_reference: np.ndarray,
    X_current: np.ndarray,
    output_dir: str,
) -> str | None:
    """
    Retorna el path del JSON generado, o None si falla.
    """
    try:
        from evidently import Report
        from evidently.presets import DataDriftPreset

        ref_df = pd.DataFrame(
            X_reference.reshape(len(X_reference), -1).astype(float)
        )
        cur_df = pd.DataFrame(
            X_current.reshape(len(X_current), -1).astype(float)
        )

        # Alinear columnas — mismo nombre en referencia y actual
        ref_df.columns = [str(c) for c in ref_df.columns]
        cur_df.columns = ref_df.columns.tolist()

        report = Report(metrics=[DataDriftPreset()])
        report.run(reference_data=ref_df, current_data=cur_df)

        output_path = str(Path(output_dir) / "drift_report.json")
        report.save_json(output_path)
        log.info("Drift report generado → %s", output_path)
        return output_path

    except ImportError as e:
        log.warning("Evidently no disponible: %s", e)
        return None
    except Exception as e:
        log.warning("No se pudo generar el drift report: %s", e)
        return None