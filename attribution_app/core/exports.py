"""Exportação de resultados em CSV e XLSX."""

from __future__ import annotations

import io
from typing import Dict

import pandas as pd


def to_csv_bytes(df: pd.DataFrame) -> bytes:
    return df.to_csv(index=False).encode("utf-8-sig")


def to_xlsx_bytes(df: pd.DataFrame, sheet_name: str = "dados") -> bytes:
    buf = io.BytesIO()
    with pd.ExcelWriter(buf, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name=sheet_name[:31] or "dados")
    buf.seek(0)
    return buf.read()


def to_multi_sheet_xlsx(sheets: Dict[str, pd.DataFrame]) -> bytes:
    """Gera um único XLSX com várias abas."""
    buf = io.BytesIO()
    with pd.ExcelWriter(buf, engine="openpyxl") as writer:
        for name, df in sheets.items():
            safe = (name or "dados")[:31]
            (df if df is not None else pd.DataFrame()).to_excel(
                writer, index=False, sheet_name=safe
            )
    buf.seek(0)
    return buf.read()


def params_to_frame(params_dict: dict) -> pd.DataFrame:
    """Transforma os parâmetros usados no processamento em um DataFrame."""
    return pd.DataFrame(
        [{"parametro": k, "valor": v} for k, v in params_dict.items()]
    )
