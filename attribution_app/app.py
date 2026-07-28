"""Aplicação Streamlit — Atribuição de matrículas a canais e campanhas.

Camada de apresentação. Toda a lógica de negócio fica no pacote ``core``,
mantido independente da UI para evoluir depois para uma API/banco de produção.

Execução:
    streamlit run app.py
"""

from __future__ import annotations

import os
import sys

# Garante que o pacote ``core`` seja importável quando o Streamlit executa
# este arquivo diretamente.
ROOT = os.path.dirname(os.path.abspath(__file__))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

import pandas as pd
import streamlit as st

from core import (
    aggregation,
    attribution,
    config,
    data_loader,
    exports,
    sample_data,
    validation,
)
from core.aggregation import DIMENSION_SPEC
from core.config import AttributionParams, MODELS

try:
    import plotly.express as px
    HAS_PLOTLY = True
except Exception:  # pragma: no cover - plotly é opcional para o núcleo
    HAS_PLOTLY = False


st.set_page_config(
    page_title="Atribuição de Matrículas",
    page_icon="🎓",
    layout="wide",
)

# ---------------------------------------------------------------------------
# Estado da sessão
# ---------------------------------------------------------------------------
def _init_state():
    defaults = {
        "interactions": None,
        "enrollments": None,
        "investments": None,
        "params": AttributionParams(),
        "result": None,
        "validations": {},
    }
    for k, v in defaults.items():
        if k not in st.session_state:
            st.session_state[k] = v


_init_state()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _fmt_brl(v) -> str:
    if v is None or pd.isna(v):
        return "—"
    return "R$ " + f"{v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def _fmt_pct(v) -> str:
    if v is None or pd.isna(v):
        return "—"
    return f"{v*100:.1f}%"


def _process():
    """Recalcula a atribuição com os dados e parâmetros atuais."""
    if st.session_state.interactions is None or st.session_state.enrollments is None:
        st.warning("Carregue ao menos os arquivos de interações e matrículas.")
        return
    params = st.session_state.params
    res = attribution.compute_attribution(
        st.session_state.interactions,
        st.session_state.enrollments,
        params,
    )
    st.session_state.result = res


def _load_samples():
    interactions, enrollments, investments = sample_data.generate()
    st.session_state.interactions = interactions
    st.session_state.enrollments = enrollments
    st.session_state.investments = investments
    st.session_state.validations = {
        "interações": validation.validate_interactions(interactions),
        "matrículas": validation.validate_enrollments(enrollments),
        "investimentos": validation.validate_investments(investments),
    }
    _process()


def _has_result() -> bool:
    return st.session_state.result is not None and not st.session_state.result.touchpoints.empty


# ---------------------------------------------------------------------------
# Tela 1 — Importação
# ---------------------------------------------------------------------------
def screen_import():
    st.header("1 · Importação de dados")
    st.caption(
        "Faça upload dos arquivos CSV/XLSX. As colunas são validadas e os dados "
        "pré-visualizados antes do processamento."
    )

    col_btn, _ = st.columns([1, 3])
    with col_btn:
        if st.button("⚡ Carregar dados de exemplo", use_container_width=True):
            _load_samples()
            st.success("Dados de exemplo carregados e processados.")

    st.divider()

    specs = [
        ("interactions", "Interações", data_loader.load_interactions,
         validation.validate_interactions, config.INTERACTION_COLUMNS),
        ("enrollments", "Matrículas", data_loader.load_enrollments,
         validation.validate_enrollments, config.ENROLLMENT_COLUMNS),
        ("investments", "Investimentos", data_loader.load_investments,
         validation.validate_investments, config.INVESTMENT_COLUMNS),
    ]

    cols = st.columns(3)
    for (key, label, loader, validator, expected), c in zip(specs, cols):
        with c:
            st.subheader(label)
            st.caption("Colunas: " + ", ".join(expected))
            up = st.file_uploader(
                f"Arquivo de {label.lower()}",
                type=["csv", "xlsx", "xls"],
                key=f"up_{key}",
            )
            if up is not None:
                import io
                df = loader(io.BytesIO(up.getvalue()), up.name)
                result = validator(df)
                st.session_state[key] = (
                    result.valid_df if result.valid_df is not None else df
                )
                st.session_state.validations[result.name] = result

    st.divider()

    # Resumo das validações.
    if st.session_state.validations:
        st.subheader("Resumo da validação")
        for name, r in st.session_state.validations.items():
            with st.expander(
                f"{'✅' if r.ok else '❌'} {name} — "
                f"{r.valid_rows}/{r.total_rows} linhas válidas",
                expanded=not r.ok,
            ):
                for e in r.errors:
                    st.error(e)
                for w in r.warnings:
                    st.warning(w)
                if not r.errors and not r.warnings:
                    st.success("Sem problemas detectados.")

    # Pré-visualização.
    st.subheader("Pré-visualização")
    tabs = st.tabs(["Interações", "Matrículas", "Investimentos"])
    for tab, key in zip(tabs, ["interactions", "enrollments", "investments"]):
        with tab:
            df = st.session_state.get(key)
            if df is not None:
                st.dataframe(df.head(50), use_container_width=True)
                st.caption(f"{len(df)} linhas.")
            else:
                st.info("Nenhum arquivo carregado.")

    if st.session_state.interactions is not None and st.session_state.enrollments is not None:
        if st.button("▶️ Processar atribuição", type="primary"):
            _process()
            st.success("Atribuição processada. Veja as demais telas.")


# ---------------------------------------------------------------------------
# Tela 2 — Configuração do modelo
# ---------------------------------------------------------------------------
def screen_config():
    st.header("2 · Configuração do modelo")
    st.info(
        "Os pesos abaixo são **parâmetros experimentais**, não verdades "
        "estatísticas. Ajuste-os livremente para testar hipóteses de atribuição.",
        icon="🧪",
    )
    p = st.session_state.params

    col1, col2 = st.columns(2)
    with col1:
        window = st.number_input(
            "Janela de atribuição (dias)", min_value=1, max_value=1095,
            value=int(p.window_days),
            help="Só interações ocorridas nesta janela antes da matrícula são consideradas.",
        )
        half_life = st.number_input(
            "Meia-vida temporal (dias) — h", min_value=1.0, max_value=365.0,
            value=float(p.half_life),
            help="Decaimento exponencial: T_i = 0,5 ^ (d_i / h). "
                 "Quanto menor, mais peso para contatos recentes.",
        )
        rep_basis = st.selectbox(
            "Base do peso de repetição",
            options=config.REPETITION_BASES,
            index=config.REPETITION_BASES.index(p.repetition_basis),
            format_func=lambda x: {
                "channel": "Por canal",
                "campaign": "Por campanha",
                "channel_campaign": "Por canal e campanha",
            }[x],
            help="Define o agrupamento em que a repetição é contada. "
                 "R_i = 1/√n_i, onde n_i é a ordem da interação repetida.",
        )
    with col2:
        w_first = st.number_input(
            "Peso do primeiro contato — P (first)", min_value=0.0, max_value=5.0,
            value=float(p.weight_first), step=0.1,
        )
        w_middle = st.number_input(
            "Peso dos contatos intermediários — P (middle)", min_value=0.0, max_value=5.0,
            value=float(p.weight_middle), step=0.1,
        )
        w_last = st.number_input(
            "Peso do último contato — P (last)", min_value=0.0, max_value=5.0,
            value=float(p.weight_last), step=0.1,
        )
        model = st.selectbox(
            "Modelo de atribuição",
            options=list(MODELS.keys()),
            index=list(MODELS.keys()).index(p.model),
            format_func=lambda k: MODELS[k].label,
        )
        st.caption(MODELS[model].description)

    st.session_state.params = AttributionParams(
        window_days=int(window),
        half_life=float(half_life),
        weight_first=float(w_first),
        weight_middle=float(w_middle),
        weight_last=float(w_last),
        weight_single=1.0,
        repetition_basis=rep_basis,
        model=model,
    )

    with st.expander("📐 Explicação das fórmulas"):
        st.markdown(
            r"""
- **Score bruto:** $S_i = P_i \times T_i \times R_i$
- **Peso de posição $P_i$:** primeiro/último recebem mais peso; único = 1,0.
- **Peso temporal $T_i = 0{,}5^{\,d_i/h}$**, sendo $d_i$ os dias até a matrícula.
- **Peso de repetição $R_i = 1/\sqrt{n_i}$**, reduzindo o ganho de repetições.
- **Crédito normalizado:** $\text{credito}_i = S_i / \sum S$ (soma por matrícula = 100%).
- **Receita atribuída** $= \text{credito}_i \times \text{valor da matrícula}$.
"""
        )

    if st.button("▶️ Processar / recalcular atribuição", type="primary"):
        _process()
        if _has_result():
            st.success("Atribuição recalculada com os parâmetros atuais.")


# ---------------------------------------------------------------------------
# Tela 3 — Jornada individual
# ---------------------------------------------------------------------------
def screen_journey():
    st.header("3 · Jornada individual")
    if not _has_result():
        st.warning("Processe a atribuição primeiro (telas 1 e 2).")
        return

    res = st.session_state.result
    tp = res.touchpoints

    mode = st.radio("Pesquisar por", ["enrollment_id", "lead_id"], horizontal=True)
    options = sorted(tp[mode].dropna().unique().tolist())
    if not options:
        st.info("Sem touchpoints para exibir.")
        return
    selected = st.selectbox(f"Selecione um {mode}", options)

    journey = tp[tp[mode] == selected].copy()

    for enr_id, g in journey.groupby("enrollment_id"):
        g = g.sort_values("interaction_datetime")
        value = g["enrollment_value"].iloc[0]
        st.subheader(f"Matrícula {enr_id}")
        c1, c2, c3 = st.columns(3)
        c1.metric("Valor da matrícula", _fmt_brl(value))
        c2.metric("Touchpoints", len(g))
        c3.metric("Soma dos créditos", _fmt_pct(g["credit"].sum()))

        show = g[[
            "interaction_datetime", "channel", "campaign_name", "campaign_type",
            "position", "days_to_enrollment", "P", "T", "R", "score", "credit",
            "attributed_revenue",
        ]].rename(columns={
            "interaction_datetime": "data",
            "channel": "canal",
            "campaign_name": "campanha",
            "campaign_type": "tipo",
            "position": "posição",
            "days_to_enrollment": "dias até matrícula",
            "score": "score bruto",
            "credit": "crédito",
            "attributed_revenue": "receita atribuída",
        })
        show["dias até matrícula"] = show["dias até matrícula"].round(1)
        for col in ["P", "T", "R", "score bruto"]:
            show[col] = show[col].round(4)
        show["crédito"] = (show["crédito"] * 100).round(2).astype(str) + "%"
        show["receita atribuída"] = show["receita atribuída"].map(_fmt_brl)
        st.dataframe(show, use_container_width=True, hide_index=True)

        st.success(f"✅ Os créditos desta matrícula somam {_fmt_pct(g['credit'].sum())}.")

        if HAS_PLOTLY:
            fig = px.bar(
                g.sort_values("interaction_datetime"),
                x="interaction_datetime", y="credit", color="channel",
                hover_data=["campaign_name", "position", "days_to_enrollment"],
                title="Crédito por touchpoint na linha do tempo",
            )
            fig.update_yaxes(tickformat=".0%")
            st.plotly_chart(fig, use_container_width=True)


# ---------------------------------------------------------------------------
# Telas 4 e 5 — Resultado por canal / campanha
# ---------------------------------------------------------------------------
def _render_dimension(dimension: str, title: str):
    res = st.session_state.result
    inv = st.session_state.investments
    agg = aggregation.aggregate(res.touchpoints, inv, dimension)

    label_cols = DIMENSION_SPEC[dimension]["tp"]

    display = agg.copy()
    fmt = display.copy()
    for c in ["investment", "attributed_revenue", "cpa"]:
        if c in fmt.columns:
            fmt[c] = fmt[c].map(_fmt_brl)
    fmt["attributed_enrollments"] = fmt["attributed_enrollments"].round(2)
    fmt["roas"] = fmt["roas"].map(lambda v: "—" if pd.isna(v) else f"{v:.2f}x")
    for c in ["pct_started", "pct_middle", "pct_finished"]:
        fmt[c] = fmt[c].map(_fmt_pct)

    rename = {
        "investment": "investimento",
        "touchpoints": "touchpoints",
        "leads_impacted": "leads impactados",
        "enrollments_participated": "matrículas participou",
        "attributed_enrollments": "matríc. equivalentes",
        "attributed_revenue": "receita atribuída",
        "cpa": "CPA atribuído",
        "roas": "ROAS atribuído",
        "pct_started": "% iniciou",
        "pct_middle": "% meio",
        "pct_finished": "% finalizou",
        "investment_without_attribution": "invest. sem atribuição",
    }
    st.dataframe(fmt.rename(columns=rename), use_container_width=True, hide_index=True)

    if HAS_PLOTLY and not agg.empty:
        chart = agg[agg[label_cols[0]].notna()].copy()
        chart["_label"] = chart[label_cols].astype(str).agg(" · ".join, axis=1)
        c1, c2 = st.columns(2)
        with c1:
            fig = px.bar(chart, x="_label", y="attributed_revenue",
                         title="Receita atribuída", labels={"_label": title})
            st.plotly_chart(fig, use_container_width=True)
        with c2:
            roas_chart = chart[chart["roas"].notna()]
            if not roas_chart.empty:
                fig2 = px.bar(roas_chart, x="_label", y="roas",
                              title="ROAS atribuído", labels={"_label": title})
                st.plotly_chart(fig2, use_container_width=True)


def screen_by_channel():
    st.header("4 · Resultado por canal")
    if not _has_result():
        st.warning("Processe a atribuição primeiro (telas 1 e 2).")
        return
    tabs = st.tabs(["Canal", "Plataforma", "Canal × Tipo de campanha"])
    with tabs[0]:
        _render_dimension("channel", "Canal")
    with tabs[1]:
        _render_dimension("platform", "Plataforma")
    with tabs[2]:
        _render_dimension("channel_campaign_type", "Canal × Tipo")


def screen_by_campaign():
    st.header("5 · Resultado por campanha")
    if not _has_result():
        st.warning("Processe a atribuição primeiro (telas 1 e 2).")
        return
    tabs = st.tabs(["Campanha", "Tipo de campanha", "Curso", "Mês"])
    with tabs[0]:
        _render_dimension("campaign_name", "Campanha")
    with tabs[1]:
        _render_dimension("campaign_type", "Tipo de campanha")
    with tabs[2]:
        _render_dimension("course", "Curso")
    with tabs[3]:
        _render_dimension("month", "Mês")


# ---------------------------------------------------------------------------
# Tela 6 — Comparação de modelos
# ---------------------------------------------------------------------------
def screen_compare():
    st.header("6 · Comparação de modelos")
    if st.session_state.interactions is None or st.session_state.enrollments is None:
        st.warning("Carregue os dados primeiro (tela 1).")
        return

    dimension = st.selectbox(
        "Dimensão de comparação",
        options=["channel", "campaign_type", "platform"],
        format_func=lambda d: DIMENSION_SPEC[d]["label"],
    )
    models = st.multiselect(
        "Modelos",
        options=list(MODELS.keys()),
        default=config.DEFAULT_COMPARISON_MODELS,
        format_func=lambda k: MODELS[k].label,
    )
    if not models:
        st.info("Selecione ao menos um modelo.")
        return

    comp = attribution.compare_models(
        st.session_state.interactions,
        st.session_state.enrollments,
        st.session_state.params,
        models=models,
        dimension=dimension,
    )
    if comp.empty:
        st.info("Sem dados para comparar.")
        return

    st.caption(
        "Cada modelo redistribui os mesmos 100% de crédito de forma diferente. "
        "Os totais globais são idênticos; muda a **distribuição** entre grupos."
    )

    pivot = comp.pivot_table(
        index=dimension, columns="model", values="attributed_revenue", aggfunc="sum"
    ).fillna(0)
    st.dataframe(
        pivot.style.format(_fmt_brl), use_container_width=True
    )

    if HAS_PLOTLY:
        fig = px.bar(
            comp, x=dimension, y="attributed_revenue", color="model",
            barmode="group", title="Receita atribuída por modelo",
        )
        st.plotly_chart(fig, use_container_width=True)


# ---------------------------------------------------------------------------
# Tela 7 — Exportação
# ---------------------------------------------------------------------------
def screen_export():
    st.header("7 · Exportação")
    if not _has_result():
        st.warning("Processe a atribuição primeiro (telas 1 e 2).")
        return

    res = st.session_state.result
    inv = st.session_state.investments
    aggs = aggregation.aggregate_all(res.touchpoints, inv)

    sheets = {
        "atrib_por_interacao": res.touchpoints,
        "atrib_por_matricula": res.enrollment_summary,
        "consol_canal": aggs["channel"],
        "consol_campanha": aggs["campaign_name"],
        "consol_tipo_campanha": aggs["campaign_type"],
        "consol_plataforma": aggs["platform"],
        "consol_curso": aggs["course"],
        "consol_mes": aggs["month"],
        "parametros": exports.params_to_frame(res.params.to_dict()),
    }

    st.subheader("Download individual (CSV)")
    cols = st.columns(3)
    for i, (name, df) in enumerate(sheets.items()):
        with cols[i % 3]:
            st.download_button(
                f"⬇️ {name}.csv",
                data=exports.to_csv_bytes(df),
                file_name=f"{name}.csv",
                mime="text/csv",
                use_container_width=True,
            )

    st.divider()
    st.subheader("Download consolidado (XLSX — todas as abas)")
    st.download_button(
        "⬇️ atribuicao_completa.xlsx",
        data=exports.to_multi_sheet_xlsx(sheets),
        file_name="atribuicao_completa.xlsx",
        mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        type="primary",
    )


# ---------------------------------------------------------------------------
# Navegação
# ---------------------------------------------------------------------------
SCREENS = {
    "1 · Importação": screen_import,
    "2 · Configuração do modelo": screen_config,
    "3 · Jornada individual": screen_journey,
    "4 · Resultado por canal": screen_by_channel,
    "5 · Resultado por campanha": screen_by_campaign,
    "6 · Comparação de modelos": screen_compare,
    "7 · Exportação": screen_export,
}


def main():
    st.sidebar.title("🎓 Atribuição de Matrículas")
    st.sidebar.caption("Modelo multi-touch configurável (MVP)")

    choice = st.sidebar.radio("Navegação", list(SCREENS.keys()))

    st.sidebar.divider()
    # Status resumido.
    if _has_result():
        res = st.session_state.result
        summ = res.enrollment_summary
        with_tp = int(summ["has_touchpoints"].sum())
        st.sidebar.metric("Matrículas c/ touchpoints", with_tp)
        st.sidebar.metric("Matrículas s/ touchpoints",
                          int((~summ["has_touchpoints"]).sum()))
        st.sidebar.metric("Receita atribuída",
                          _fmt_brl(res.touchpoints["attributed_revenue"].sum()))
        st.sidebar.caption(f"Modelo atual: **{MODELS[res.params.model].label}**")
    else:
        st.sidebar.info("Nenhum resultado processado ainda.")

    SCREENS[choice]()


if __name__ == "__main__":
    main()
