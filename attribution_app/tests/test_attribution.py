"""Testes das validações obrigatórias do modelo de atribuição."""

import numpy as np
import pandas as pd
import pytest

from core import attribution
from core.config import AttributionParams


# ---------------------------------------------------------------------------
# 1. Cada matrícula distribui exatamente 100% do crédito
# ---------------------------------------------------------------------------
@pytest.mark.parametrize(
    "model", ["linear", "first_click", "last_click", "position", "time_decay", "full"]
)
def test_credit_sums_to_one_per_enrollment(datasets, model):
    interactions, enrollments, _ = datasets
    params = AttributionParams(model=model)
    res = attribution.compute_attribution(interactions, enrollments, params)

    tp = res.touchpoints
    per_enr = tp.groupby("enrollment_id")["credit"].sum()
    # Toda matrícula com touchpoints deve somar 1.0.
    assert np.allclose(per_enr.to_numpy(), 1.0, atol=1e-9)

    # E o resumo também reflete isso.
    summ = res.enrollment_summary
    with_tp = summ[summ["has_touchpoints"]]
    assert np.allclose(with_tp["sum_credit"].to_numpy(), 1.0, atol=1e-9)


# ---------------------------------------------------------------------------
# 2. Nenhuma interação posterior à matrícula é utilizada
# ---------------------------------------------------------------------------
def test_no_touchpoint_after_enrollment(datasets):
    interactions, enrollments, _ = datasets
    res = attribution.compute_attribution(interactions, enrollments)
    tp = res.touchpoints
    assert (tp["interaction_datetime"] < tp["enrollment_datetime"]).all()


# ---------------------------------------------------------------------------
# 3. Nenhuma interação fora da janela é utilizada
# ---------------------------------------------------------------------------
def test_no_touchpoint_outside_window(datasets):
    interactions, enrollments, _ = datasets
    params = AttributionParams(window_days=30)
    res = attribution.compute_attribution(interactions, enrollments, params)
    tp = res.touchpoints
    assert (tp["days_to_enrollment"] <= 30 + 1e-9).all()
    assert (tp["days_to_enrollment"] >= 0).all()


def test_window_boundary_is_respected():
    """Interação exatamente no limite da janela não deve entrar; dentro deve."""
    enr_dt = pd.Timestamp("2026-06-01 00:00:00")
    interactions = pd.DataFrame(
        [
            # Exatamente 180 dias antes -> fora (>= window_start é o limite;
            # 181 dias antes é claramente fora).
            dict(lead_id="L1", interaction_id="I1",
                 interaction_datetime=enr_dt - pd.Timedelta(days=181),
                 channel="Google Ads", platform="Google",
                 campaign_name="c", campaign_type="performance",
                 course="x", click_id="", cost=1.0),
            # Dentro da janela.
            dict(lead_id="L1", interaction_id="I2",
                 interaction_datetime=enr_dt - pd.Timedelta(days=10),
                 channel="Meta Ads", platform="Meta",
                 campaign_name="c2", campaign_type="performance",
                 course="x", click_id="", cost=1.0),
        ]
    )
    enrollments = pd.DataFrame(
        [dict(lead_id="L1", enrollment_id="E1", enrollment_datetime=enr_dt,
              course="x", enrollment_value=1000.0)]
    )
    res = attribution.compute_attribution(
        interactions, enrollments, AttributionParams(window_days=180)
    )
    used_ids = set(res.touchpoints["interaction_id"])
    assert used_ids == {"I2"}


# ---------------------------------------------------------------------------
# 4. Matrículas sem touchpoints são identificadas
# ---------------------------------------------------------------------------
def test_enrollments_without_touchpoints_flagged(datasets):
    interactions, enrollments, _ = datasets
    res = attribution.compute_attribution(interactions, enrollments)
    orphans = res.enrollments_without_touchpoints
    # Cada órfã deve ter 0 touchpoints e não aparecer no detalhamento.
    assert (orphans["num_touchpoints"] == 0).all()
    assert set(orphans["enrollment_id"]).isdisjoint(set(res.touchpoints["enrollment_id"]))
    # O dataset de exemplo garante ao menos uma órfã.
    assert len(orphans) >= 1


# ---------------------------------------------------------------------------
# 6/7. O modelo não duplica matrículas nem receita
# ---------------------------------------------------------------------------
def test_no_duplication_of_enrollments_or_revenue(datasets):
    interactions, enrollments, _ = datasets
    res = attribution.compute_attribution(interactions, enrollments)
    summ = res.enrollment_summary
    with_tp = summ[summ["has_touchpoints"]]

    # Matrículas equivalentes atribuídas == número de matrículas com touchpoints.
    total_equiv = res.touchpoints["credit"].sum()
    assert np.isclose(total_equiv, len(with_tp), atol=1e-9)

    # Receita atribuída == receita das matrículas com touchpoints.
    total_attr_revenue = res.touchpoints["attributed_revenue"].sum()
    expected_revenue = with_tp["enrollment_value"].sum()
    assert np.isclose(total_attr_revenue, expected_revenue, atol=1e-6)


def test_multiple_enrollments_use_only_intermediate_touchpoints():
    """Para leads com 2 matrículas, a 2ª só usa touchpoints após a 1ª."""
    e1 = pd.Timestamp("2026-03-01")
    e2 = pd.Timestamp("2026-06-01")
    interactions = pd.DataFrame(
        [
            dict(lead_id="L1", interaction_id="A",
                 interaction_datetime=pd.Timestamp("2026-02-10"),
                 channel="Google Ads", platform="Google", campaign_name="c",
                 campaign_type="performance", course="x", click_id="", cost=1.0),
            dict(lead_id="L1", interaction_id="B",
                 interaction_datetime=pd.Timestamp("2026-04-10"),
                 channel="Meta Ads", platform="Meta", campaign_name="c",
                 campaign_type="performance", course="y", click_id="", cost=1.0),
            dict(lead_id="L1", interaction_id="C",
                 interaction_datetime=pd.Timestamp("2026-05-10"),
                 channel="E-mail", platform="CRM", campaign_name="c",
                 campaign_type="institucional", course="y", click_id="", cost=0.0),
        ]
    )
    enrollments = pd.DataFrame(
        [
            dict(lead_id="L1", enrollment_id="E1", enrollment_datetime=e1,
                 course="x", enrollment_value=1000.0),
            dict(lead_id="L1", enrollment_id="E2", enrollment_datetime=e2,
                 course="y", enrollment_value=2000.0),
        ]
    )
    res = attribution.compute_attribution(interactions, enrollments)
    tp = res.touchpoints
    e1_ids = set(tp[tp.enrollment_id == "E1"]["interaction_id"])
    e2_ids = set(tp[tp.enrollment_id == "E2"]["interaction_id"])
    assert e1_ids == {"A"}
    assert e2_ids == {"B", "C"}  # não reaproveita "A"


def test_single_touch_gets_full_credit():
    enr_dt = pd.Timestamp("2026-06-01")
    interactions = pd.DataFrame(
        [dict(lead_id="L1", interaction_id="A",
              interaction_datetime=enr_dt - pd.Timedelta(days=5),
              channel="Google Ads", platform="Google", campaign_name="c",
              campaign_type="performance", course="x", click_id="", cost=1.0)]
    )
    enrollments = pd.DataFrame(
        [dict(lead_id="L1", enrollment_id="E1", enrollment_datetime=enr_dt,
              course="x", enrollment_value=1000.0)]
    )
    res = attribution.compute_attribution(interactions, enrollments)
    tp = res.touchpoints
    assert len(tp) == 1
    assert np.isclose(tp["credit"].iloc[0], 1.0)
    assert tp["position"].iloc[0] == "single"
    assert np.isclose(tp["attributed_revenue"].iloc[0], 1000.0)


def test_linear_model_gives_equal_credit():
    enr_dt = pd.Timestamp("2026-06-01")
    interactions = pd.DataFrame(
        [
            dict(lead_id="L1", interaction_id=f"I{i}",
                 interaction_datetime=enr_dt - pd.Timedelta(days=10 - i),
                 channel="Google Ads", platform="Google", campaign_name="c",
                 campaign_type="performance", course="x", click_id="", cost=1.0)
            for i in range(4)
        ]
    )
    enrollments = pd.DataFrame(
        [dict(lead_id="L1", enrollment_id="E1", enrollment_datetime=enr_dt,
              course="x", enrollment_value=1000.0)]
    )
    res = attribution.compute_attribution(
        interactions, enrollments, AttributionParams(model="linear")
    )
    tp = res.touchpoints
    assert np.allclose(tp["credit"].to_numpy(), 0.25)
