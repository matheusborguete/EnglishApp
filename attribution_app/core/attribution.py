"""Motor de atribuição de crédito de matrículas aos touchpoints.

Reconstrói a jornada de cada lead até a matrícula e distribui 100% do crédito
entre os pontos de contato (touchpoints), segundo o score:

    S_i = P_i * T_i * R_i

    P_i : peso de posição (primeiro / meio / último / único)
    T_i : peso temporal, decaimento exponencial  T_i = 0.5 ^ (d_i / h)
    R_i : peso de repetição                        R_i = 1 / sqrt(n_i)

Depois normaliza:  credito_i = S_i / soma(S)   (soma por matrícula = 1).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List

import numpy as np
import pandas as pd

from . import config
from .config import AttributionParams, MODELS, ModelSpec


# Colunas do detalhamento por touchpoint (atribuição por interação)
TOUCHPOINT_COLUMNS = [
    "enrollment_id",
    "lead_id",
    "interaction_id",
    "interaction_datetime",
    "enrollment_datetime",
    "channel",
    "platform",
    "campaign_name",
    "campaign_type",
    "course",
    "click_id",
    "cost",
    "position",
    "occurrence",
    "days_to_enrollment",
    "P",
    "T",
    "R",
    "score",
    "credit",
    "enrollment_value",
    "attributed_revenue",
    "month",
]


@dataclass
class AttributionResult:
    """Saída completa do processamento de atribuição."""

    touchpoints: pd.DataFrame           # atribuição detalhada por interação
    enrollment_summary: pd.DataFrame    # atribuição consolidada por matrícula
    params: AttributionParams

    @property
    def enrollments_without_touchpoints(self) -> pd.DataFrame:
        return self.enrollment_summary[~self.enrollment_summary["has_touchpoints"]].copy()


def _repetition_group_cols(basis: str) -> List[str]:
    if basis == "channel":
        return ["channel"]
    if basis == "campaign":
        return ["campaign_name"]
    return ["channel", "campaign_name"]  # channel_campaign


def _position_weights(n: int, params: AttributionParams) -> List[str]:
    if n == 1:
        return ["single"]
    positions = ["middle"] * n
    positions[0] = "first"
    positions[-1] = "last"
    return positions


_POSITION_WEIGHT_ATTR = {
    "first": "weight_first",
    "middle": "weight_middle",
    "last": "weight_last",
    "single": "weight_single",
}


def _touchpoints_for_enrollment(
    lead_interactions: pd.DataFrame,
    enrollment_dt: pd.Timestamp,
    prev_enrollment_dt: pd.Timestamp | None,
    window_days: int,
) -> pd.DataFrame:
    """Aplica as regras de preparação e devolve os touchpoints elegíveis.

    Regras: apenas interações ANTES da matrícula, dentro da janela de
    ``window_days`` e (quando houver matrícula anterior do mesmo lead)
    posteriores a ela.
    """
    window_start = enrollment_dt - pd.Timedelta(days=window_days)

    mask = (
        (lead_interactions["interaction_datetime"] < enrollment_dt)
        & (lead_interactions["interaction_datetime"] >= window_start)
    )
    if prev_enrollment_dt is not None and pd.notna(prev_enrollment_dt):
        mask &= lead_interactions["interaction_datetime"] > prev_enrollment_dt

    tp = lead_interactions[mask].sort_values("interaction_datetime")
    return tp


def _score_for_model(tp: pd.DataFrame, spec: ModelSpec) -> np.ndarray:
    """Calcula o score bruto de cada touchpoint conforme o modelo."""
    n = len(tp)

    # Modelos de clique único: todo o crédito num único touchpoint.
    if spec.single_touch == "first":
        s = np.zeros(n)
        s[0] = 1.0
        return s
    if spec.single_touch == "last":
        s = np.zeros(n)
        s[-1] = 1.0
        return s

    score = np.ones(n)
    if spec.use_position:
        score = score * tp["P"].to_numpy()
    if spec.use_time:
        score = score * tp["T"].to_numpy()
    if spec.use_repetition:
        score = score * tp["R"].to_numpy()
    return score


def compute_attribution(
    interactions: pd.DataFrame,
    enrollments: pd.DataFrame,
    params: AttributionParams | None = None,
) -> AttributionResult:
    """Executa a atribuição para todas as matrículas.

    Cada matrícula é tratada separadamente. Para leads com múltiplas
    matrículas, cada uma usa apenas os touchpoints posteriores à matrícula
    anterior e anteriores à própria matrícula.
    """
    params = params or AttributionParams()
    params.validate()
    spec = MODELS[params.model]

    interactions = interactions.copy()
    enrollments = enrollments.copy()

    # Garante tipos de data.
    interactions["interaction_datetime"] = pd.to_datetime(
        interactions["interaction_datetime"], errors="coerce"
    )
    enrollments["enrollment_datetime"] = pd.to_datetime(
        enrollments["enrollment_datetime"], errors="coerce"
    )
    interactions = interactions.dropna(subset=["interaction_datetime"])

    # Ordena matrículas por lead e data para determinar a matrícula anterior.
    enrollments = enrollments.sort_values(["lead_id", "enrollment_datetime"])
    enrollments["prev_enrollment_dt"] = enrollments.groupby("lead_id")[
        "enrollment_datetime"
    ].shift(1)

    rep_cols = _repetition_group_cols(params.repetition_basis)

    # Indexa interações por lead para acesso rápido.
    inter_by_lead: Dict[object, pd.DataFrame] = {
        lead: g for lead, g in interactions.groupby("lead_id")
    }

    touchpoint_frames: List[pd.DataFrame] = []
    summary_rows: List[dict] = []

    for row in enrollments.itertuples(index=False):
        lead = getattr(row, "lead_id")
        enr_id = getattr(row, "enrollment_id")
        enr_dt = getattr(row, "enrollment_datetime")
        enr_value = getattr(row, "enrollment_value")
        enr_course = getattr(row, "course", None)
        prev_dt = getattr(row, "prev_enrollment_dt")

        lead_inter = inter_by_lead.get(lead)
        if lead_inter is None or lead_inter.empty:
            tp = interactions.iloc[0:0]
        else:
            tp = _touchpoints_for_enrollment(
                lead_inter, enr_dt, prev_dt, params.window_days
            )

        n = len(tp)
        if n == 0:
            summary_rows.append(
                dict(
                    enrollment_id=enr_id,
                    lead_id=lead,
                    course=enr_course,
                    enrollment_datetime=enr_dt,
                    enrollment_value=enr_value,
                    num_touchpoints=0,
                    has_touchpoints=False,
                    sum_credit=0.0,
                    attributed_revenue=0.0,
                )
            )
            continue

        tp = tp.copy()
        tp["enrollment_id"] = enr_id
        tp["enrollment_datetime"] = enr_dt
        tp["enrollment_value"] = enr_value

        # Posição
        positions = _position_weights(n, params)
        tp["position"] = positions
        tp["P"] = [getattr(params, _POSITION_WEIGHT_ATTR[p]) for p in positions]

        # Distância em dias (fracionária, para suavizar o decaimento).
        days = (enr_dt - tp["interaction_datetime"]).dt.total_seconds() / 86400.0
        tp["days_to_enrollment"] = days.to_numpy()

        # Peso temporal
        tp["T"] = np.power(0.5, tp["days_to_enrollment"] / params.half_life)

        # Peso de repetição: ordem da interação dentro do agrupamento escolhido.
        tp["occurrence"] = tp.groupby(rep_cols).cumcount() + 1
        tp["R"] = 1.0 / np.sqrt(tp["occurrence"].to_numpy())

        # Score bruto conforme o modelo.
        score = _score_for_model(tp, spec)
        tp["score"] = score

        total = score.sum()
        if total <= 0:
            # Fallback defensivo: distribui igualmente para não perder crédito.
            tp["credit"] = 1.0 / n
        else:
            tp["credit"] = score / total

        tp["attributed_revenue"] = tp["credit"] * float(enr_value or 0.0)

        touchpoint_frames.append(tp)

        summary_rows.append(
            dict(
                enrollment_id=enr_id,
                lead_id=lead,
                course=enr_course,
                enrollment_datetime=enr_dt,
                enrollment_value=enr_value,
                num_touchpoints=n,
                has_touchpoints=True,
                sum_credit=float(tp["credit"].sum()),
                attributed_revenue=float(tp["attributed_revenue"].sum()),
            )
        )

    if touchpoint_frames:
        touchpoints = pd.concat(touchpoint_frames, ignore_index=True)
        touchpoints["month"] = touchpoints["interaction_datetime"].dt.strftime("%Y-%m")
        # Reordena/garante colunas.
        for col in TOUCHPOINT_COLUMNS:
            if col not in touchpoints.columns:
                touchpoints[col] = pd.NA
        touchpoints = touchpoints[TOUCHPOINT_COLUMNS]
    else:
        touchpoints = pd.DataFrame(columns=TOUCHPOINT_COLUMNS)

    enrollment_summary = pd.DataFrame(summary_rows)

    return AttributionResult(
        touchpoints=touchpoints,
        enrollment_summary=enrollment_summary,
        params=params,
    )


def compare_models(
    interactions: pd.DataFrame,
    enrollments: pd.DataFrame,
    base_params: AttributionParams,
    models: List[str] | None = None,
    dimension: str = "channel",
) -> pd.DataFrame:
    """Compara modelos de atribuição por uma dimensão (padrão: canal).

    Retorna um DataFrame longo com colunas:
    [dimension, model, attributed_enrollments, attributed_revenue].
    """
    models = models or config.DEFAULT_COMPARISON_MODELS
    frames = []
    for model_key in models:
        p = AttributionParams.from_dict({**base_params.to_dict(), "model": model_key})
        res = compute_attribution(interactions, enrollments, p)
        tp = res.touchpoints
        if tp.empty:
            continue
        grouped = (
            tp.groupby(dimension, dropna=False)
            .agg(
                attributed_enrollments=("credit", "sum"),
                attributed_revenue=("attributed_revenue", "sum"),
            )
            .reset_index()
        )
        grouped["model"] = MODELS[model_key].label
        grouped["model_key"] = model_key
        frames.append(grouped)

    if not frames:
        return pd.DataFrame(
            columns=[dimension, "model", "model_key",
                     "attributed_enrollments", "attributed_revenue"]
        )
    return pd.concat(frames, ignore_index=True)
