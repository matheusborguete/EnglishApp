"""Testes de validação de esquema dos arquivos de entrada."""

import pandas as pd

from core import validation


def test_missing_required_column_is_error():
    df = pd.DataFrame({"lead_id": ["L1"], "interaction_id": ["I1"]})
    r = validation.validate_interactions(df)
    assert not r.ok
    assert any("obrigatórias" in e for e in r.errors)


def test_valid_and_invalid_rows_are_split():
    df = pd.DataFrame(
        {
            "lead_id": ["L1", None],
            "interaction_id": ["I1", "I2"],
            "interaction_datetime": pd.to_datetime(["2026-01-01", "2026-01-02"]),
            "channel": ["Google Ads", "Meta Ads"],
        }
    )
    r = validation.validate_interactions(df)
    assert r.ok  # colunas obrigatórias presentes
    assert r.total_rows == 2
    assert r.valid_rows == 1
    assert r.invalid_rows == 1


def test_enrollment_validation_ok():
    df = pd.DataFrame(
        {
            "lead_id": ["L1"],
            "enrollment_id": ["E1"],
            "enrollment_datetime": pd.to_datetime(["2026-01-01"]),
            "course": ["x"],
            "enrollment_value": [1000.0],
        }
    )
    r = validation.validate_enrollments(df)
    assert r.ok
    assert r.valid_rows == 1
