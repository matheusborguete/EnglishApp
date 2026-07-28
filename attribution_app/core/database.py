"""Persistência em SQLite.

Camada fina sobre o SQLite pensada para o MVP local. As funções recebem/
devolvem DataFrames do Pandas. A separação em um módulo próprio facilita
trocar por um banco de produção (Postgres, etc.) no futuro.
"""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Optional

import pandas as pd

DEFAULT_DB_PATH = str(Path(__file__).resolve().parent.parent / "attribution.db")


def get_connection(db_path: str = DEFAULT_DB_PATH) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path)
    return conn


def save_dataframe(
    df: pd.DataFrame,
    table: str,
    db_path: str = DEFAULT_DB_PATH,
    if_exists: str = "replace",
) -> None:
    conn = get_connection(db_path)
    try:
        # Datas viram texto ISO para armazenamento estável.
        out = df.copy()
        for col in out.columns:
            if pd.api.types.is_datetime64_any_dtype(out[col]):
                out[col] = out[col].astype("string")
        out.to_sql(table, conn, if_exists=if_exists, index=False)
    finally:
        conn.close()


def load_dataframe(table: str, db_path: str = DEFAULT_DB_PATH) -> Optional[pd.DataFrame]:
    conn = get_connection(db_path)
    try:
        try:
            return pd.read_sql(f"SELECT * FROM {table}", conn)
        except Exception:
            return None
    finally:
        conn.close()


def save_params(params_dict: dict, db_path: str = DEFAULT_DB_PATH) -> None:
    conn = get_connection(db_path)
    try:
        conn.execute(
            "CREATE TABLE IF NOT EXISTS params (key TEXT PRIMARY KEY, value TEXT)"
        )
        conn.execute(
            "INSERT OR REPLACE INTO params (key, value) VALUES (?, ?)",
            ("current", json.dumps(params_dict)),
        )
        conn.commit()
    finally:
        conn.close()


def load_params(db_path: str = DEFAULT_DB_PATH) -> Optional[dict]:
    conn = get_connection(db_path)
    try:
        try:
            cur = conn.execute("SELECT value FROM params WHERE key = 'current'")
            row = cur.fetchone()
            return json.loads(row[0]) if row else None
        except Exception:
            return None
    finally:
        conn.close()


def save_session(
    interactions: pd.DataFrame,
    enrollments: pd.DataFrame,
    investments: pd.DataFrame,
    touchpoints: pd.DataFrame,
    enrollment_summary: pd.DataFrame,
    params_dict: dict,
    db_path: str = DEFAULT_DB_PATH,
) -> None:
    """Salva todo o estado do processamento atual."""
    save_dataframe(interactions, "interactions", db_path)
    save_dataframe(enrollments, "enrollments", db_path)
    save_dataframe(investments, "investments", db_path)
    save_dataframe(touchpoints, "touchpoints", db_path)
    save_dataframe(enrollment_summary, "enrollment_summary", db_path)
    save_params(params_dict, db_path)
