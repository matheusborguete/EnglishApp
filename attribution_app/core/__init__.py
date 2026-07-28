"""Núcleo da aplicação de atribuição de matrículas a canais e campanhas.

Este pacote concentra toda a lógica de negócio (carga de dados, validação,
atribuição, agregação, persistência e exportação), mantida separada da camada
de apresentação (``app.py`` em Streamlit) para facilitar a evolução futura
para uma API e um banco de dados de produção.
"""

__all__ = [
    "config",
    "data_loader",
    "validation",
    "attribution",
    "aggregation",
    "database",
    "exports",
    "sample_data",
]
