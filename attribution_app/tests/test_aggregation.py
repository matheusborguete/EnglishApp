"""Testes de consolidação: totais e sinalização de investimentos."""

import numpy as np
import pandas as pd
import pytest

from core import attribution, aggregation, validation
from core.aggregation import DIMENSION_SPEC


@pytest.fixture(scope="module")
def result(datasets):
    interactions, enrollments, investments = datasets
    res = attribution.compute_attribution(interactions, enrollments)
    return res, investments


# ---------------------------------------------------------------------------
# 8. Filtros e agregações não alteram os totais
# ---------------------------------------------------------------------------
@pytest.mark.parametrize("dimension", list(DIMENSION_SPEC.keys()))
def test_aggregation_preserves_totals(result, dimension):
    res, investments = result
    tp = res.touchpoints
    grand_equiv = tp["credit"].sum()
    grand_rev = tp["attributed_revenue"].sum()

    agg = aggregation.aggregate(tp, investments, dimension)

    # A soma das matrículas equivalentes/receita por grupo == total global.
    assert np.isclose(agg["attributed_enrollments"].sum(), grand_equiv, atol=1e-6)
    assert np.isclose(agg["attributed_revenue"].sum(), grand_rev, atol=1e-6)


def test_no_division_by_zero_in_metrics(result):
    res, investments = result
    tp = res.touchpoints
    for dim in DIMENSION_SPEC:
        agg = aggregation.aggregate(tp, investments, dim)
        # Nenhum valor infinito (divisões protegidas devem gerar NaN, não inf).
        assert not np.isinf(agg["cpa"].to_numpy(dtype="float64")).any()
        assert not np.isinf(agg["roas"].to_numpy(dtype="float64")).any()


# ---------------------------------------------------------------------------
# 5. Investimentos sem correspondência são sinalizados
# ---------------------------------------------------------------------------
def test_unmatched_investments_flagged(result):
    res, investments = result
    unmatched = validation.find_unmatched_investments(res.touchpoints, investments)
    names = set(unmatched["campaign_name"].astype(str))
    assert any("Descontinuada" in n for n in names)


def test_percentages_between_zero_and_one(result):
    res, investments = result
    for dim in DIMENSION_SPEC:
        agg = aggregation.aggregate(res.touchpoints, investments, dim)
        for col in ["pct_started", "pct_middle", "pct_finished"]:
            vals = agg[col].dropna().to_numpy()
            assert ((vals >= -1e-9) & (vals <= 1 + 1e-9)).all()
