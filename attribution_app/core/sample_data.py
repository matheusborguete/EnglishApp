"""Geração de dados fictícios para testes e demonstração.

Cobre os cenários exigidos:
  * >= 100 leads;
  * múltiplos canais;
  * interações repetidas;
  * campanhas institucionais e específicas (e também performance/remarketing);
  * leads convertidos e não convertidos;
  * jornadas com uma única interação;
  * jornadas longas;
  * matrículas sem interação identificada.
"""

from __future__ import annotations

import random
from datetime import datetime, timedelta
from typing import Tuple

import pandas as pd

CHANNELS = [
    # (channel, platform, is_paid)
    ("Google Ads", "Google", True),
    ("Meta Ads", "Meta", True),
    ("LinkedIn Ads", "LinkedIn", True),
    ("TikTok Ads", "TikTok", True),
    ("E-mail", "CRM", False),
    ("Orgânico", "Site", False),
]

COURSES = [
    "MBA em Gestão",
    "Data Science",
    "Marketing Digital",
    "Engenharia de Software",
    "Agronegócio",
]

CAMPAIGN_TYPES = ["institucional", "especifica", "performance", "remarketing"]


def _campaign_name(channel: str, ctype: str, course: str) -> str:
    if ctype == "institucional":
        return f"{channel} - Marca Institucional"
    if ctype == "especifica":
        return f"{channel} - {course}"
    if ctype == "remarketing":
        return f"{channel} - Remarketing"
    return f"{channel} - Performance"


def _click_id(channel: str, rng: random.Random) -> str:
    token = "".join(rng.choices("abcdef0123456789", k=12))
    if channel == "Google Ads":
        return f"GCLID_{token}"
    if channel == "Meta Ads":
        return f"FBCLID_{token}"
    return ""


def generate(seed: int = 42, n_leads: int = 120) -> Tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """Gera (interactions, enrollments, investments) determinísticos."""
    rng = random.Random(seed)
    base_date = datetime(2026, 1, 1, 9, 0, 0)

    interactions = []
    enrollments = []
    interaction_seq = 0
    enrollment_seq = 0

    for lead_idx in range(1, n_leads + 1):
        lead_id = f"L{lead_idx:04d}"
        course = rng.choice(COURSES)

        # Perfil da jornada.
        roll = rng.random()
        if roll < 0.15:
            n_inter = 1                       # jornada curta / clique único
        elif roll < 0.75:
            n_inter = rng.randint(2, 6)       # jornada média
        else:
            n_inter = rng.randint(7, 14)      # jornada longa

        # Data de início da jornada (dispersa ao longo de ~5 meses).
        journey_start = base_date + timedelta(days=rng.randint(0, 150))

        lead_interactions = []
        cursor = journey_start
        for _ in range(n_inter):
            channel, platform, is_paid = rng.choice(CHANNELS)
            ctype = rng.choice(CAMPAIGN_TYPES)
            campaign = _campaign_name(channel, ctype, course)
            cursor = cursor + timedelta(
                days=rng.randint(0, 12),
                hours=rng.randint(0, 23),
            )
            interaction_seq += 1
            cost = round(rng.uniform(0.8, 9.0), 2) if is_paid else 0.0
            lead_interactions.append(
                dict(
                    lead_id=lead_id,
                    interaction_id=f"I{interaction_seq:06d}",
                    interaction_datetime=cursor,
                    channel=channel,
                    platform=platform,
                    campaign_name=campaign,
                    campaign_type=ctype,
                    course=course,
                    click_id=_click_id(channel, rng),
                    cost=cost,
                )
            )

        # ~55% dos leads convertem.
        converts = rng.random() < 0.55

        # Alguns leads convertem SEM nenhuma interação registrada (matrícula
        # sem touchpoint) -> não adiciona interações desse lead.
        orphan_enrollment = rng.random() < 0.08

        if not orphan_enrollment:
            interactions.extend(lead_interactions)

        if converts:
            last_dt = lead_interactions[-1]["interaction_datetime"]
            enroll_dt = last_dt + timedelta(days=rng.randint(1, 20), hours=rng.randint(0, 23))
            if orphan_enrollment:
                # Matrícula existe mas as interações não foram registradas.
                enroll_dt = journey_start + timedelta(days=rng.randint(5, 60))
            enrollment_seq += 1
            enrollments.append(
                dict(
                    lead_id=lead_id,
                    enrollment_id=f"E{enrollment_seq:05d}",
                    enrollment_datetime=enroll_dt,
                    course=course,
                    enrollment_value=round(rng.uniform(4000, 24000), 2),
                )
            )

            # Uma parcela pequena de leads faz uma segunda matrícula (outro curso).
            if rng.random() < 0.05 and not orphan_enrollment:
                course2 = rng.choice([c for c in COURSES if c != course])
                # Interações adicionais entre a 1ª e a 2ª matrícula.
                cursor2 = enroll_dt + timedelta(days=rng.randint(3, 30))
                extra = []
                for _ in range(rng.randint(1, 4)):
                    channel, platform, is_paid = rng.choice(CHANNELS)
                    ctype = rng.choice(CAMPAIGN_TYPES)
                    interaction_seq += 1
                    cursor2 = cursor2 + timedelta(days=rng.randint(1, 15))
                    extra.append(
                        dict(
                            lead_id=lead_id,
                            interaction_id=f"I{interaction_seq:06d}",
                            interaction_datetime=cursor2,
                            channel=channel,
                            platform=platform,
                            campaign_name=_campaign_name(channel, ctype, course2),
                            campaign_type=ctype,
                            course=course2,
                            click_id=_click_id(channel, rng),
                            cost=round(rng.uniform(0.8, 9.0), 2) if is_paid else 0.0,
                        )
                    )
                interactions.extend(extra)
                enroll_dt2 = cursor2 + timedelta(days=rng.randint(1, 15))
                enrollment_seq += 1
                enrollments.append(
                    dict(
                        lead_id=lead_id,
                        enrollment_id=f"E{enrollment_seq:05d}",
                        enrollment_datetime=enroll_dt2,
                        course=course2,
                        enrollment_value=round(rng.uniform(4000, 24000), 2),
                    )
                )

    interactions_df = pd.DataFrame(interactions)
    enrollments_df = pd.DataFrame(enrollments)

    # Investimentos por período/canal/plataforma/campanha/tipo.
    investments = _build_investments(interactions_df, rng)

    return interactions_df, enrollments_df, investments


def _build_investments(interactions_df: pd.DataFrame, rng: random.Random) -> pd.DataFrame:
    """Cria investimentos mensais por campanha, mais um caso sem correspondência."""
    rows = []
    if not interactions_df.empty:
        tmp = interactions_df.copy()
        tmp["period"] = pd.to_datetime(tmp["interaction_datetime"]).dt.strftime("%Y-%m")
        grp = tmp.groupby(
            ["period", "channel", "platform", "campaign_name", "campaign_type"],
            dropna=False,
        )
        for (period, channel, platform, campaign, ctype), g in grp:
            # Investimento aproximadamente proporcional ao custo dos cliques.
            base = float(g["cost"].sum())
            invest = round(base * rng.uniform(3.0, 6.0) + rng.uniform(50, 400), 2)
            rows.append(
                dict(
                    period=period,
                    channel=channel,
                    platform=platform,
                    campaign_name=campaign,
                    campaign_type=ctype,
                    investment=invest,
                )
            )

    # Caso proposital de investimento SEM correspondência (deve ser sinalizado).
    rows.append(
        dict(
            period="2026-02",
            channel="Google Ads",
            platform="Google",
            campaign_name="Google Ads - Campanha Descontinuada",
            campaign_type="performance",
            investment=1500.00,
        )
    )
    return pd.DataFrame(rows)


def write_sample_files(out_dir: str, seed: int = 42, n_leads: int = 120) -> dict:
    """Gera os arquivos CSV de exemplo em ``out_dir`` e devolve os caminhos."""
    from pathlib import Path

    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    interactions, enrollments, investments = generate(seed=seed, n_leads=n_leads)

    paths = {
        "interactions": str(out / "interactions.csv"),
        "enrollments": str(out / "enrollments.csv"),
        "investments": str(out / "investments.csv"),
    }
    interactions.to_csv(paths["interactions"], index=False)
    enrollments.to_csv(paths["enrollments"], index=False)
    investments.to_csv(paths["investments"], index=False)
    return paths


if __name__ == "__main__":
    import os

    here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    target = os.path.join(here, "sample_data")
    paths = write_sample_files(target)
    print("Arquivos de exemplo gerados:")
    for k, v in paths.items():
        print(f"  {k}: {v}")
