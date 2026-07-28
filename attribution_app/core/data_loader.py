"""Carga e normalização dos arquivos de entrada (CSV / XLSX)."""

from __future__ import annotations

import io
from typing import Union

import pandas as pd

from . import config

FileLike = Union[str, bytes, io.BytesIO]


def _read_any(source: FileLike, filename: str | None = None) -> pd.DataFrame:
    """Lê CSV ou XLSX a partir de um caminho, bytes ou buffer.

    A escolha do parser é feita pela extensão do ``filename`` (quando
    disponível) ou por tentativa: primeiro Excel, depois CSV.
    """
    name = (filename or (source if isinstance(source, str) else "")).lower()

    if name.endswith((".xlsx", ".xls")):
        return pd.read_excel(source)
    if name.endswith((".csv", ".txt")):
        return _read_csv(source)

    # Sem extensão conhecida: tenta Excel, cai para CSV.
    try:
        return pd.read_excel(source)
    except Exception:
        if isinstance(source, io.BytesIO):
            source.seek(0)
        return _read_csv(source)


def _read_csv(source: FileLike) -> pd.DataFrame:
    """Lê CSV tentando separadores comuns (vírgula e ponto e vírgula)."""
    for sep in (",", ";"):
        try:
            if isinstance(source, io.BytesIO):
                source.seek(0)
            df = pd.read_csv(source, sep=sep)
            if df.shape[1] > 1:
                return df
        except Exception:
            continue
    if isinstance(source, io.BytesIO):
        source.seek(0)
    return pd.read_csv(source)


def _normalize_columns(df: pd.DataFrame) -> pd.DataFrame:
    """Padroniza nomes de colunas: minúsculas, sem espaços nas bordas."""
    df = df.copy()
    df.columns = [str(c).strip().lower().replace(" ", "_") for c in df.columns]
    return df


def load_interactions(source: FileLike, filename: str | None = None) -> pd.DataFrame:
    df = _normalize_columns(_read_any(source, filename))
    if "interaction_datetime" in df.columns:
        df["interaction_datetime"] = pd.to_datetime(
            df["interaction_datetime"], errors="coerce", utc=False
        )
    if "cost" in df.columns:
        df["cost"] = pd.to_numeric(df["cost"], errors="coerce")
    # Normaliza textos-chave para evitar duplicidades por espaços/caixa.
    for col in ("channel", "platform", "campaign_type"):
        if col in df.columns:
            df[col] = df[col].astype("string").str.strip()
    return df


def load_enrollments(source: FileLike, filename: str | None = None) -> pd.DataFrame:
    df = _normalize_columns(_read_any(source, filename))
    if "enrollment_datetime" in df.columns:
        df["enrollment_datetime"] = pd.to_datetime(
            df["enrollment_datetime"], errors="coerce", utc=False
        )
    if "enrollment_value" in df.columns:
        df["enrollment_value"] = pd.to_numeric(df["enrollment_value"], errors="coerce")
    return df


def load_investments(source: FileLike, filename: str | None = None) -> pd.DataFrame:
    df = _normalize_columns(_read_any(source, filename))
    if "investment" in df.columns:
        df["investment"] = pd.to_numeric(df["investment"], errors="coerce")
    for col in ("channel", "platform", "campaign_type", "period"):
        if col in df.columns:
            df[col] = df[col].astype("string").str.strip()
    return df
