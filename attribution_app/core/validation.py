"""Validação de esquema e qualidade dos dados de entrada."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import List

import pandas as pd

from . import config


@dataclass
class ValidationResult:
    """Resultado da validação de um arquivo."""

    name: str
    ok: bool = True
    errors: List[str] = field(default_factory=list)          # bloqueiam o processamento
    warnings: List[str] = field(default_factory=list)        # apenas alertam
    total_rows: int = 0
    valid_rows: int = 0
    invalid_rows: int = 0
    missing_columns: List[str] = field(default_factory=list)
    extra_columns: List[str] = field(default_factory=list)
    valid_df: pd.DataFrame | None = None
    invalid_df: pd.DataFrame | None = None

    def add_error(self, msg: str) -> None:
        self.errors.append(msg)
        self.ok = False

    def add_warning(self, msg: str) -> None:
        self.warnings.append(msg)


def _check_columns(df, expected, required, result: ValidationResult) -> None:
    cols = set(df.columns)
    result.missing_columns = [c for c in expected if c not in cols]
    result.extra_columns = [c for c in cols if c not in expected]

    missing_required = [c for c in required if c not in cols]
    if missing_required:
        result.add_error(
            "Colunas obrigatórias ausentes: " + ", ".join(missing_required)
        )
    optional_missing = [c for c in result.missing_columns if c not in required]
    if optional_missing:
        result.add_warning(
            "Colunas opcionais ausentes (serão preenchidas como vazias): "
            + ", ".join(optional_missing)
        )
    if result.extra_columns:
        result.add_warning(
            "Colunas extras ignoradas: " + ", ".join(result.extra_columns)
        )


def _split_valid_invalid(df, required_notna, result: ValidationResult) -> None:
    """Separa linhas válidas das inválidas com base em campos obrigatórios."""
    present = [c for c in required_notna if c in df.columns]
    if present:
        bad_mask = df[present].isna().any(axis=1)
    else:
        bad_mask = pd.Series(False, index=df.index)

    result.total_rows = len(df)
    result.valid_df = df[~bad_mask].copy()
    result.invalid_df = df[bad_mask].copy()
    result.valid_rows = len(result.valid_df)
    result.invalid_rows = len(result.invalid_df)
    if result.invalid_rows:
        result.add_warning(
            f"{result.invalid_rows} linha(s) descartada(s) por campos "
            f"obrigatórios ausentes/ inválidos."
        )


def validate_interactions(df: pd.DataFrame) -> ValidationResult:
    r = ValidationResult(name="interações")
    _check_columns(df, config.INTERACTION_COLUMNS,
                   config.REQUIRED_INTERACTION_COLUMNS, r)
    if not r.ok:
        r.total_rows = len(df)
        return r
    _split_valid_invalid(
        df,
        ["lead_id", "interaction_id", "interaction_datetime", "channel"],
        r,
    )
    return r


def validate_enrollments(df: pd.DataFrame) -> ValidationResult:
    r = ValidationResult(name="matrículas")
    _check_columns(df, config.ENROLLMENT_COLUMNS,
                   config.REQUIRED_ENROLLMENT_COLUMNS, r)
    if not r.ok:
        r.total_rows = len(df)
        return r
    _split_valid_invalid(
        df,
        ["lead_id", "enrollment_id", "enrollment_datetime", "enrollment_value"],
        r,
    )
    if r.valid_df is not None and r.valid_df["enrollment_id"].duplicated().any():
        r.add_warning("Existem enrollment_id duplicados no arquivo de matrículas.")
    return r


def validate_investments(df: pd.DataFrame) -> ValidationResult:
    r = ValidationResult(name="investimentos")
    _check_columns(df, config.INVESTMENT_COLUMNS,
                   config.REQUIRED_INVESTMENT_COLUMNS, r)
    if not r.ok:
        r.total_rows = len(df)
        return r
    _split_valid_invalid(df, ["channel", "investment"], r)
    return r


def find_enrollments_without_touchpoints(enrollment_summary: pd.DataFrame) -> pd.DataFrame:
    """Retorna as matrículas que não tiveram nenhum touchpoint na janela."""
    if enrollment_summary.empty:
        return enrollment_summary
    return enrollment_summary[~enrollment_summary["has_touchpoints"]].copy()


def find_unmatched_investments(
    touchpoints: pd.DataFrame, investments: pd.DataFrame
) -> pd.DataFrame:
    """Investimentos sem correspondência com nenhum touchpoint atribuído.

    Compara pela combinação (channel, platform, campaign_name, campaign_type).
    """
    keys = ["channel", "platform", "campaign_name", "campaign_type"]
    keys = [k for k in keys if k in investments.columns]
    if investments.empty or not keys:
        return investments.iloc[0:0].copy()

    if touchpoints.empty:
        return investments.copy()

    tp_keys = touchpoints[[k for k in keys if k in touchpoints.columns]].drop_duplicates()
    merged = investments.merge(
        tp_keys.assign(_matched=1),
        on=[k for k in keys if k in touchpoints.columns],
        how="left",
    )
    unmatched = merged[merged["_matched"].isna()].drop(columns=["_matched"])
    return unmatched.copy()
