"""Consolidação dos créditos atribuídos por diferentes dimensões."""

from __future__ import annotations

from typing import List

import numpy as np
import pandas as pd

# Mapeia a dimensão de consolidação para as colunas de agrupamento nos
# touchpoints e no arquivo de investimentos.
DIMENSION_SPEC = {
    "channel": {"tp": ["channel"], "inv": ["channel"], "label": "Canal"},
    "platform": {"tp": ["platform"], "inv": ["platform"], "label": "Plataforma"},
    "campaign_name": {"tp": ["campaign_name"], "inv": ["campaign_name"], "label": "Campanha"},
    "campaign_type": {"tp": ["campaign_type"], "inv": ["campaign_type"], "label": "Tipo de campanha"},
    "course": {"tp": ["course"], "inv": None, "label": "Curso"},
    "month": {"tp": ["month"], "inv": ["period"], "label": "Mês"},
    "channel_campaign_type": {
        "tp": ["channel", "campaign_type"],
        "inv": ["channel", "campaign_type"],
        "label": "Canal x Tipo de campanha",
    },
}


def _safe_div(numerator, denominator):
    """Divisão protegida: retorna NaN quando o denominador é 0/ausente."""
    num = np.asarray(numerator, dtype="float64")
    den = np.asarray(denominator, dtype="float64")
    with np.errstate(divide="ignore", invalid="ignore"):
        out = np.where((den == 0) | np.isnan(den), np.nan, num / den)
    return out


def _investment_by(investments: pd.DataFrame, inv_cols: List[str]) -> pd.DataFrame:
    if investments is None or investments.empty or inv_cols is None:
        return pd.DataFrame(columns=(inv_cols or []) + ["investment"])
    inv = investments.copy()
    if "investment" not in inv.columns:
        inv["investment"] = 0.0
    grouped = (
        inv.groupby(inv_cols, dropna=False)["investment"].sum().reset_index()
    )
    return grouped


def aggregate(
    touchpoints: pd.DataFrame,
    investments: pd.DataFrame | None,
    dimension: str,
) -> pd.DataFrame:
    """Consolida os resultados de atribuição por uma dimensão.

    Métricas por agrupamento:
      - investimento
      - touchpoints
      - leads impactados
      - matrículas em que participou
      - matrículas equivalentes atribuídas
      - receita atribuída
      - CPA atribuído = investimento / matrículas equivalentes
      - ROAS atribuído = receita atribuída / investimento
      - % das jornadas em que iniciou / apareceu no meio / finalizou
    """
    if dimension not in DIMENSION_SPEC:
        raise ValueError(f"Dimensão inválida: {dimension!r}")

    spec = DIMENSION_SPEC[dimension]
    tp_cols = spec["tp"]
    inv_cols = spec["inv"]

    if touchpoints.empty:
        base = pd.DataFrame(columns=tp_cols)
    else:
        tp = touchpoints.copy()
        # Marcadores de posição por touchpoint (para % de início/meio/fim).
        tp["is_start"] = tp["position"].isin(["first", "single"])
        tp["is_middle"] = tp["position"].eq("middle")
        tp["is_finish"] = tp["position"].isin(["last", "single"])

        # Passo 1: por (grupo, matrícula), a jornada iniciou/meio/finalizou?
        per_enr = (
            tp.groupby(tp_cols + ["enrollment_id"], dropna=False)
            .agg(
                started=("is_start", "any"),
                middled=("is_middle", "any"),
                finished=("is_finish", "any"),
            )
            .reset_index()
        )
        journey_pct = (
            per_enr.groupby(tp_cols, dropna=False)
            .agg(
                pct_started=("started", "mean"),
                pct_middle=("middled", "mean"),
                pct_finished=("finished", "mean"),
            )
            .reset_index()
        )

        # Passo 2: métricas principais por grupo.
        base = (
            tp.groupby(tp_cols, dropna=False)
            .agg(
                touchpoints=("interaction_id", "count"),
                leads_impacted=("lead_id", "nunique"),
                enrollments_participated=("enrollment_id", "nunique"),
                attributed_enrollments=("credit", "sum"),
                attributed_revenue=("attributed_revenue", "sum"),
            )
            .reset_index()
        )
        base = base.merge(journey_pct, on=tp_cols, how="left")

    # Investimento por dimensão (quando disponível).
    if inv_cols is not None:
        inv_grouped = _investment_by(investments, inv_cols)
        if not inv_grouped.empty:
            # Renomeia colunas de investimento para casar com as do touchpoint.
            rename = dict(zip(inv_cols, tp_cols))
            inv_grouped = inv_grouped.rename(columns=rename)
            base = base.merge(inv_grouped, on=tp_cols, how="outer")
        else:
            base["investment"] = np.nan
    else:
        base["investment"] = np.nan  # dimensão sem correspondência de investimento

    # Preenche zeros para grupos que só existem em um dos lados.
    fill_zero = [
        "touchpoints",
        "leads_impacted",
        "enrollments_participated",
        "attributed_enrollments",
        "attributed_revenue",
    ]
    for c in fill_zero:
        if c not in base.columns:
            base[c] = 0
        base[c] = base[c].fillna(0)
    if "investment" not in base.columns:
        base["investment"] = np.nan

    for c in ["pct_started", "pct_middle", "pct_finished"]:
        if c not in base.columns:
            base[c] = np.nan

    # Métricas derivadas com proteção contra divisão por zero.
    base["cpa"] = _safe_div(base["investment"], base["attributed_enrollments"])
    base["roas"] = _safe_div(base["attributed_revenue"], base["investment"])

    # Sinaliza investimentos sem correspondência de atribuição.
    base["investment_without_attribution"] = (
        base["investment"].fillna(0) > 0
    ) & (base["attributed_enrollments"] == 0)

    # Ordena por receita atribuída (desc) para leitura.
    base = base.sort_values("attributed_revenue", ascending=False).reset_index(drop=True)

    ordered = tp_cols + [
        "investment",
        "touchpoints",
        "leads_impacted",
        "enrollments_participated",
        "attributed_enrollments",
        "attributed_revenue",
        "cpa",
        "roas",
        "pct_started",
        "pct_middle",
        "pct_finished",
        "investment_without_attribution",
    ]
    ordered = [c for c in ordered if c in base.columns]
    return base[ordered]


def aggregate_all(
    touchpoints: pd.DataFrame,
    investments: pd.DataFrame | None,
) -> dict:
    """Gera todas as consolidações previstas de uma vez."""
    return {dim: aggregate(touchpoints, investments, dim) for dim in DIMENSION_SPEC}


def totals(touchpoints: pd.DataFrame) -> dict:
    """Totais globais usados para conferência (não devem mudar por filtro)."""
    if touchpoints.empty:
        return {"attributed_enrollments": 0.0, "attributed_revenue": 0.0}
    return {
        "attributed_enrollments": float(touchpoints["credit"].sum()),
        "attributed_revenue": float(touchpoints["attributed_revenue"].sum()),
    }
