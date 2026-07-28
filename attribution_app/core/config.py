"""Parâmetros e configurações padrão do modelo de atribuição.

IMPORTANTE: os pesos iniciais NÃO representam verdade estatística. São
parâmetros experimentais e totalmente configuráveis. O objetivo é permitir
testar modelos de atribuição, auditar cada matrícula e comparar a eficiência
relativa dos canais e tipos de campanha.
"""

from __future__ import annotations

from dataclasses import dataclass, asdict, field
from typing import Any, Dict


# ---------------------------------------------------------------------------
# Colunas esperadas em cada arquivo de entrada
# ---------------------------------------------------------------------------
INTERACTION_COLUMNS = [
    "lead_id",
    "interaction_id",
    "interaction_datetime",
    "channel",
    "platform",
    "campaign_name",
    "campaign_type",
    "course",
    "click_id",
    "cost",
]

ENROLLMENT_COLUMNS = [
    "lead_id",
    "enrollment_id",
    "enrollment_datetime",
    "course",
    "enrollment_value",
]

INVESTMENT_COLUMNS = [
    "period",
    "channel",
    "platform",
    "campaign_name",
    "campaign_type",
    "investment",
]

# Colunas obrigatórias (sem as quais a linha é inválida / o arquivo é inaceitável)
REQUIRED_INTERACTION_COLUMNS = [
    "lead_id",
    "interaction_id",
    "interaction_datetime",
    "channel",
]
REQUIRED_ENROLLMENT_COLUMNS = [
    "lead_id",
    "enrollment_id",
    "enrollment_datetime",
    "enrollment_value",
]
REQUIRED_INVESTMENT_COLUMNS = [
    "channel",
    "investment",
]

# Tipos de campanha reconhecidos (apenas informativo; não restringe a entrada)
CAMPAIGN_TYPES = ["institucional", "especifica", "performance", "remarketing"]

# Bases possíveis para o peso de repetição
REPETITION_BASES = ["channel", "campaign", "channel_campaign"]

# Dimensões de consolidação disponíveis
AGG_DIMENSIONS = [
    "channel",
    "platform",
    "campaign_name",
    "campaign_type",
    "course",
    "month",
    "channel_campaign_type",
]


@dataclass
class AttributionParams:
    """Parâmetros configuráveis do modelo de atribuição."""

    window_days: int = 180          # janela de atribuição (dias antes da matrícula)
    half_life: float = 30.0         # meia-vida do decaimento temporal (dias)
    weight_first: float = 1.3       # peso de posição do primeiro contato
    weight_middle: float = 1.0      # peso de posição dos contatos intermediários
    weight_last: float = 1.3        # peso de posição do último contato
    weight_single: float = 1.0      # peso quando existe apenas uma interação
    repetition_basis: str = "channel_campaign"  # channel | campaign | channel_campaign
    model: str = "full"             # ver MODELS abaixo

    def validate(self) -> None:
        if self.window_days <= 0:
            raise ValueError("window_days deve ser positivo")
        if self.half_life <= 0:
            raise ValueError("half_life deve ser positivo")
        if self.repetition_basis not in REPETITION_BASES:
            raise ValueError(
                f"repetition_basis inválido: {self.repetition_basis!r}. "
                f"Use um de {REPETITION_BASES}"
            )
        if self.model not in MODELS:
            raise ValueError(
                f"model inválido: {self.model!r}. Use um de {list(MODELS)}"
            )

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "AttributionParams":
        known = {f: data[f] for f in cls.__dataclass_fields__ if f in data}
        return cls(**known)


# ---------------------------------------------------------------------------
# Modelos de atribuição (cenários de comparação)
# ---------------------------------------------------------------------------
# Cada modelo define quais fatores do score S_i = P_i * T_i * R_i estão ativos.
# Modelos de "click único" (first/last) são casos especiais: 100% do crédito
# vai para o primeiro ou último touchpoint.
@dataclass
class ModelSpec:
    key: str
    label: str
    use_position: bool = False
    use_time: bool = False
    use_repetition: bool = False
    single_touch: str | None = None  # None | "first" | "last"
    description: str = ""


MODELS: Dict[str, ModelSpec] = {
    "linear": ModelSpec(
        "linear",
        "Linear",
        description="Todas as interações da matrícula recebem o mesmo peso (crédito = 1/n).",
    ),
    "first_click": ModelSpec(
        "first_click",
        "Primeiro clique",
        single_touch="first",
        description="100% do crédito para o primeiro touchpoint da jornada.",
    ),
    "last_click": ModelSpec(
        "last_click",
        "Último clique",
        single_touch="last",
        description="100% do crédito para o último touchpoint da jornada.",
    ),
    "position": ModelSpec(
        "position",
        "Posição (U)",
        use_position=True,
        description="Apenas o peso de posição (P_i). Favorece primeiro e último contato.",
    ),
    "time_decay": ModelSpec(
        "time_decay",
        "Decaimento temporal",
        use_time=True,
        description="Apenas o peso temporal (T_i). Favorece contatos mais próximos da matrícula.",
    ),
    "full": ModelSpec(
        "full",
        "Completo proposto",
        use_position=True,
        use_time=True,
        use_repetition=True,
        description="Modelo completo: S_i = P_i * T_i * R_i (posição x tempo x repetição).",
    ),
}

# Modelos exibidos na tela de comparação por padrão
DEFAULT_COMPARISON_MODELS = ["linear", "last_click", "position", "time_decay", "full"]

DEFAULT_PARAMS = AttributionParams()
